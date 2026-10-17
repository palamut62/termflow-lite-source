// termflow-agents MCP'sinin konustugu yerel API (docs/agent-ide/orchestration.md).
// Yalniz 127.0.0.1, her acilista yeni port + token. MCP sureci ajanin cocugu oldugu icin token env'le
// gelemez; port ve token kullanici klasorundeki endpoint dosyasina yazilir, MCP her cagrida okur.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import type { DelegatedTask } from '../../shared/types'
import { header, readBody, sameToken, writeAtomic } from '../agentHooks/hookServer'
import type { SubmitInput } from './manager'

const MAX_BODY = 256 * 1024
const MAX_WAIT_S = 55
const TASK_PATH = /^\/v1\/tasks\/([a-f0-9]{1,32})(\/cancel|\/discard)?$/

export interface OrchestrationApi {
  agents(): Promise<unknown>
  tasks(): DelegatedTask[]
  submit(input: SubmitInput): Promise<DelegatedTask | { error: string }>
  wait(id: string, ms: number): Promise<DelegatedTask | undefined>
  diff(task: DelegatedTask): Promise<string>
  cancel(id: string): DelegatedTask | undefined
  discard(id: string): Promise<{ ok: true } | { ok: false; error: string }>
}

export interface Endpoint {
  url: string
  token: string
  pid: number
}

type Reply = { status: number; body: unknown }

export class OrchestrationServer {
  private server: Server | null = null
  private readonly token = randomBytes(32).toString('hex')

  constructor(private readonly endpointFile: string, private readonly api: OrchestrationApi) {}

  async start(): Promise<Endpoint> {
    const server = createServer((req, res) => { void this.respond(req, res) })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    this.server = server
    const endpoint: Endpoint = { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, token: this.token, pid: process.pid }
    await writeAtomic(this.endpointFile, JSON.stringify(endpoint))
    return endpoint
  }

  stop(): void {
    this.server?.close()
    this.server = null
    rmSync(this.endpointFile, { force: true })
  }

  get running(): boolean {
    return this.server !== null
  }

  private async respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let reply: Reply
    try {
      reply = await this.route(req)
    } catch (error) {
      reply = { status: 500, body: { error: error instanceof Error ? error.message : String(error) } }
    }
    res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body))
  }

  private async route(req: IncomingMessage): Promise<Reply> {
    // DNS rebinding: yalniz dogrudan loopback istegi; tarayicidan gelen istek token'i bilemez.
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')) return { status: 403, body: { error: 'Forbidden' } }
    if (!sameToken(header(req, 'x-termflow-token'), this.token)) return { status: 403, body: { error: 'Forbidden' } }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (req.method === 'GET' && url.pathname === '/v1/agents') return { status: 200, body: await this.api.agents() }
    if (req.method === 'GET' && url.pathname === '/v1/tasks') return { status: 200, body: { tasks: this.api.tasks().slice(0, 20) } }
    if (req.method === 'POST' && url.pathname === '/v1/tasks') {
      const body = await readJson(req)
      if (!body) return { status: 400, body: { error: 'Invalid JSON body' } }
      const task = await this.api.submit({
        target: str(body.agent), model: str(body.model) || undefined, prompt: str(body.prompt), cwd: str(body.cwd),
        checkCommand: str(body.check_command) || undefined,
        timeoutS: typeof body.timeout_s === 'number' ? body.timeout_s : undefined,
        requestedBy: str(body.requested_by) || undefined
      })
      return 'error' in task ? { status: 400, body: task } : { status: 201, body: { task } }
    }

    const match = TASK_PATH.exec(url.pathname)
    if (!match) return { status: 404, body: { error: 'Not found' } }
    const [, id, action] = match
    if (req.method === 'GET' && !action) {
      const waitS = Math.min(MAX_WAIT_S, Math.max(0, Number(url.searchParams.get('wait')) || 0))
      const task = await this.api.wait(id, waitS * 1000)
      if (!task) return { status: 404, body: { error: `Unknown task "${id}"` } }
      const diff = url.searchParams.get('full_diff') === '1' && task.commit && task.worktreePath ? await this.api.diff(task).catch((e: Error) => `Diff unavailable: ${e.message}`) : undefined
      return { status: 200, body: { task, ...(diff !== undefined ? { diff } : {}) } }
    }
    if (req.method === 'POST' && action === '/cancel') {
      const task = this.api.cancel(id)
      return task ? { status: 200, body: { task } } : { status: 404, body: { error: `Unknown task "${id}"` } }
    }
    if (req.method === 'POST' && action === '/discard') {
      const result = await this.api.discard(id)
      return { status: result.ok ? 200 : 400, body: result }
    }
    return { status: 405, body: { error: 'Method not allowed' } }
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const body = await readBody(req, MAX_BODY)
  if (body === null) return null
  try {
    const parsed = JSON.parse(body) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}
