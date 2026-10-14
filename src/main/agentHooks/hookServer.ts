import { createServer, type IncomingMessage, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { claudeHookEvent, claudeHookSettings, type AgentHookEvent } from '../../shared/agentHooks'

/**
 * Claude Code HTTP hook'larinin geldigi yerel sunucu (spec: docs/orca-parity/agent-hooks.md).
 * Yalniz 127.0.0.1; her acilista yeni port ve token. Token ajana env ile gecer,
 * ayar dosyasina yazilmaz. Cevap her zaman bos 2xx: Claude'un kararina karismaz.
 */
export interface HookLaunch {
  claudeSettingsPath: string
  token: string
}

const MAX_BODY = 1024 * 1024
const TAB_ID = /^[\w-]{1,64}$/

export class AgentHookServer {
  private server: Server | null = null
  private readonly token = randomBytes(32).toString('hex')
  private launch: HookLaunch | null = null

  constructor(
    private readonly settingsPath: string,
    private readonly emit: (tabId: string, event: AgentHookEvent) => void
  ) {}

  /** Baslatma bilgisi; sunucu hazir degilse null (ajan hook'suz baslar, spinner yedegi calisir). */
  current(): HookLaunch | null {
    return this.launch
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      void this.handle(req).then((status) => { res.writeHead(status).end() })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    this.server = server
    const port = (server.address() as { port: number }).port
    await writeAtomic(this.settingsPath, JSON.stringify(claudeHookSettings(`http://127.0.0.1:${port}/claude`), null, 2))
    this.launch = { claudeSettingsPath: this.settingsPath, token: this.token }
  }

  stop(): void {
    this.launch = null
    this.server?.close()
    this.server = null
  }

  private async handle(req: IncomingMessage): Promise<number> {
    if (req.method !== 'POST' || req.url !== '/claude') return 404
    // DNS rebinding: yalniz dogrudan loopback istegi.
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')) return 403
    if (!sameToken(header(req, 'x-termflow-token'), this.token)) return 403
    const tabId = header(req, 'x-termflow-tab')
    if (!TAB_ID.test(tabId)) return 400
    const body = await readBody(req)
    if (body === null) return 413
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch { return 400 }
    const event = claudeHookEvent(parsed)
    if (event) this.emit(tabId, event)
    return 204
  }
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return typeof value === 'string' ? value : ''
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) { resolve(null); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, content, 'utf8')
  await rename(temp, file)
}
