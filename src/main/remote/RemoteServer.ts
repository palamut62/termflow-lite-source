import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { readFile, stat } from 'fs/promises'
import { extname, join, normalize, sep } from 'path'
import { gzipSync } from 'zlib'
import { WebSocketServer, type WebSocket } from 'ws'
import { MAX_CLIENT_MESSAGE_BYTES } from '../../shared/remote'
import type { DeviceStore } from './devices'
import type { RemoteConnection, RemoteHub } from './RemoteHub'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

const PAIR_ATTEMPTS_PER_MINUTE = 10
/** Text assets are gzipped once and kept; the bundle is ~0.5 MB raw. */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg'])
const HEARTBEAT_MS = 25_000

/**
 * Hostnames the server answers to: the bound address, Tailscale MagicDNS
 * names (*.ts.net) and single-label MagicDNS short names. Anything else is a
 * DNS-rebinding attempt and is refused.
 */
export function allowedHost(hostHeader: string | undefined, boundAddress: string, port: number): boolean {
  if (!hostHeader) return false
  const match = /^([A-Za-z0-9.-]+)(?::(\d+))?$/.exec(hostHeader.trim())
  if (!match) return false
  const [, hostname, portText] = match
  if (portText !== undefined && Number(portText) !== port) return false
  const host = hostname.toLowerCase()
  return host === boundAddress || host.endsWith('.ts.net') || /^[a-z0-9-]{1,63}$/.test(host)
}

/** A browser Origin must point at the very host the page was served from. */
export function sameOrigin(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin || !hostHeader) return false
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && url.host === hostHeader.trim().toLowerCase()
  } catch {
    return false
  }
}

/** Sliding one-minute window per address. */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private readonly limit: number, private readonly now: () => number = Date.now) {}

  allow(key: string): boolean {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }
}

function securityHeaders(res: ServerResponse, host: string): void {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src 'self' ws://${host}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

export interface RemoteServerOptions {
  /** Built phone client (out/remote). */
  staticDir: string
  hub: RemoteHub
  devices: Pick<DeviceStore, 'pair'>
  /** A device paired; the desktop closes its QR. */
  onPaired(): void
}

/**
 * HTTP + WebSocket transport for Remote Access. Serves the phone client,
 * exchanges pairing codes for device tokens and hands authenticated sockets
 * to the hub. Binds only to the address it is given (the Tailscale IP).
 */
export class RemoteServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private heartbeat: NodeJS.Timeout | null = null
  private address = ''
  private port = 0
  private pairLimiter = new RateLimiter(PAIR_ATTEMPTS_PER_MINUTE)
  private gzipCache = new Map<string, Buffer>()

  constructor(private readonly options: RemoteServerOptions) {}

  get listening(): boolean {
    return this.server?.listening ?? false
  }

  async start(address: string, port: number): Promise<void> {
    await this.stop()
    this.address = address
    this.port = port
    const server = createServer((req, res) => {
      void this.handleHttp(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES })
    server.on('upgrade', (req, socket, head) => {
      const host = req.headers.host
      if (req.url !== '/ws' || !allowedHost(host, this.address, this.port) || !sameOrigin(req.headers.origin, host)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws))
    })
    this.server = server
    this.wss = wss
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error)
      server.once('error', onError)
      server.listen(port, address, () => {
        server.off('error', onError)
        resolve()
      })
    })
    this.heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        const alive = (ws as WebSocket & { alive?: boolean }).alive
        if (alive === false) {
          ws.terminate()
          continue
        }
        ;(ws as WebSocket & { alive?: boolean }).alive = false
        ws.ping()
      }
    }, HEARTBEAT_MS)
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    const { server, wss } = this
    this.server = null
    this.wss = null
    for (const ws of wss?.clients ?? []) ws.terminate()
    wss?.close()
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private attach(ws: WebSocket): void {
    const tracked = ws as WebSocket & { alive?: boolean }
    tracked.alive = true
    ws.on('pong', () => { tracked.alive = true })
    const conn: RemoteConnection = {
      send: (message) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
      },
      close: (code, reason) => ws.close(code, reason),
      bufferedAmount: () => ws.bufferedAmount
    }
    const receive = this.options.hub.connect(conn)
    ws.on('message', (data, isBinary) => {
      if (!isBinary) receive(data.toString())
    })
    ws.on('close', () => this.options.hub.disconnect(conn))
    ws.on('error', () => ws.terminate())
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host
    if (!allowedHost(host, this.address, this.port)) {
      res.writeHead(421).end()
      return
    }
    securityHeaders(res, host!)
    const url = new URL(req.url ?? '/', `http://${host}`)
    if (url.pathname === '/api/pair') {
      await this.handlePair(req, res, host!)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    await this.serveStatic(url.pathname, req, res)
  }

  private async handlePair(req: IncomingMessage, res: ServerResponse, host: string): Promise<void> {
    const json = (status: number, body: object): void => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
    if (!sameOrigin(req.headers.origin, host)) return json(403, { error: 'Forbidden' })
    if (!this.pairLimiter.allow(req.socket.remoteAddress ?? 'unknown')) return json(429, { error: 'Too many attempts. Wait a minute.' })
    let body: { code?: unknown; name?: unknown }
    try {
      body = JSON.parse(await readBody(req, 4096)) as typeof body
    } catch {
      return json(400, { error: 'Invalid request' })
    }
    const paired = this.options.devices.pair(body.code, body.name)
    if (!paired) return json(401, { error: 'This QR code has expired or was already used. Show a new one on the desktop.' })
    this.options.onPaired()
    json(200, { token: paired.token, device: paired.device })
  }

  private async serveStatic(pathname: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const root = normalize(this.options.staticDir)
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      res.writeHead(400).end()
      return
    }
    let file = normalize(join(root, decoded))
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end()
      return
    }
    let isFile = false
    try {
      isFile = (await stat(file)).isFile()
    } catch {
      isFile = false
    }
    // Single-page app: unknown paths without an extension get index.html.
    if (!isFile) {
      if (extname(decoded)) {
        res.writeHead(404).end()
        return
      }
      file = join(root, 'index.html')
    }
    const ext = extname(file).toLowerCase()
    const isIndex = file.endsWith(`${sep}index.html`)
    const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    let body: Buffer
    if (gzip) {
      // index.html is small and must reflect a rebuilt client immediately.
      const cached = isIndex ? undefined : this.gzipCache.get(file)
      body = cached ?? gzipSync(await readFile(file))
      if (!isIndex) this.gzipCache.set(file, body)
    } else {
      body = await readFile(file)
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      // Hashed assets never change; the shell is always revalidated so updates land.
      'Cache-Control': isIndex || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=31536000, immutable',
      Vary: 'Accept-Encoding',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {})
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}
