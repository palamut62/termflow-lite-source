import { createServer, type IncomingMessage, type Server } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { claudeHookEvent, claudeHookSettings, claudeStatusLineCommand, type AgentHookEvent } from '../../shared/agentHooks'
import { parseClaudeRateLimits, type AgentUsage } from '../../shared/usage'

/**
 * Claude Code HTTP hook'larinin geldigi yerel sunucu (spec: docs/orca-parity/agent-hooks.md).
 * Yalniz 127.0.0.1; her acilista yeni port ve token. Token ajana env ile gecer,
 * ayar dosyasina yazilmaz. Cevap her zaman bos 2xx: Claude'un kararina karismaz.
 */
export interface HookLaunch {
  claudeSettingsPath: string
  /** Ayni hook'lar + Claude limitleri icin status line (usage-meter); kullanicinin komutu varsa onu sarmalar. */
  claudeUsageSettings: (userCommand: string | null) => string
  token: string
}

const MAX_BODY = 1024 * 1024
const TAB_ID = /^[\w-]{1,64}$/

export class AgentHookServer {
  private server: Server | null = null
  private readonly token = randomBytes(32).toString('hex')
  private launch: HookLaunch | null = null
  private claude: AgentUsage | null = null

  constructor(
    private readonly settingsPath: string,
    private readonly emit: (tabId: string, event: AgentHookEvent) => void,
    /** Claude status line'dan gelen son limitler; dosyaya yazilir ki yeniden acilista da gorunsun. */
    private readonly usageFile: string = join(dirname(settingsPath), 'usage', 'claude.json')
  ) {}

  /** Bu oturumda status line'dan gelen son Claude limitleri. */
  claudeUsage(): AgentUsage | null {
    return this.claude
  }

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
    const base = `http://127.0.0.1:${port}`
    await writeAtomic(this.settingsPath, JSON.stringify(claudeHookSettings(`${base}/claude`), null, 2))
    const written = new Map<string, string>()
    // Komut basina bir dosya (yol ayni kalsin diye kisa hash); senkron, ajan baslamadan hazir olmali.
    const claudeUsageSettings = (userCommand: string | null): string => {
      const key = userCommand ?? ''
      const cached = written.get(key)
      if (cached) return cached
      const suffix = userCommand ? `-${createHash('sha1').update(userCommand).digest('hex').slice(0, 10)}` : ''
      const file = this.settingsPath.replace(/\.json$/, `-usage${suffix}.json`)
      writeFileSync(file, JSON.stringify(claudeHookSettings(`${base}/claude`, claudeStatusLineCommand(`${base}/claude-status`, process.platform, userCommand)), null, 2))
      written.set(key, file)
      return file
    }
    this.launch = { claudeSettingsPath: this.settingsPath, claudeUsageSettings, token: this.token }
  }

  stop(): void {
    this.launch = null
    this.server?.close()
    this.server = null
  }

  private async handle(req: IncomingMessage): Promise<number> {
    if (req.method !== 'POST' || (req.url !== '/claude' && req.url !== '/claude-status')) return 404
    // DNS rebinding: yalniz dogrudan loopback istegi.
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')) return 403
    if (!sameToken(header(req, 'x-termflow-token'), this.token)) return 403
    if (req.url === '/claude-status') return this.handleStatus(req)
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

  /** Claude status line JSON'u: yalniz rate_limits saklanir (model, maliyet, yol gibi alanlar atilir). */
  private async handleStatus(req: IncomingMessage): Promise<number> {
    const body = await readBody(req)
    if (body === null) return 413
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch { return 400 }
    const usage = parseClaudeRateLimits(parsed, Date.now())
    if (usage) {
      this.claude = usage
      const limits = (parsed as { rate_limits: unknown }).rate_limits
      await writeAtomic(this.usageFile, JSON.stringify({ rate_limits: limits })).catch(() => undefined)
    }
    return 204
  }
}

export function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return typeof value === 'string' ? value : ''
}

export function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function readBody(req: IncomingMessage, maxBody = MAX_BODY): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBody) { resolve(null); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

export async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, content, 'utf8')
  await rename(temp, file)
}
