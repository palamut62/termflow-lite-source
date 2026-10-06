import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { projectKey, projectRoot } from './projectKey'
import { MemoryStore, parseFrontmatter, RETENTION_DAYS } from './store'

// Bağımlılıksız, salt okunur MCP sunucusu (JSON-RPC 2.0, satır başına bir mesaj).
// Electron'a bağımlı değil; uygulamanın kendi exe'siyle ELECTRON_RUN_AS_NODE=1
// altında çalışır. Ağa çıkmaz, anahtar görmez, yalnızca hafıza klasörünü okur.

export const SERVER_NAME = 'termflow-memory'
const FALLBACK_PROTOCOL = '2025-06-18'

const INSTRUCTIONS = [
  'TermFlow Lite memory: what was done, what is unfinished and which problems are open in this user\'s projects,',
  `built from their own coding-agent sessions of the last ${RETENTION_DAYS} days.`,
  'At the start of a session call get_project_memory with the current working directory before planning work,',
  'so you continue where earlier sessions stopped instead of redoing work. Treat it as a hint and verify against the code.'
].join(' ')

const TOOLS = [
  {
    name: 'get_project_memory',
    description: 'Memory of the project containing the given directory: status, unfinished work, open problems, done work, decisions.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'Absolute path of the current working directory. Defaults to the server working directory.' } }
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_projects',
    description: 'All projects with memory, last activity and one-line status.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'search_memory',
    description: 'Case-insensitive text search across all project memories.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Text to look for.' } },
      required: ['query']
    },
    annotations: { readOnlyHint: true }
  }
]

type JsonRpcId = string | number | null
interface JsonRpcRequest {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}

const text = (value: string, isError = false): Record<string, unknown> => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError: true } : {}) })

export class MemoryMcpServer {
  private readonly store: MemoryStore

  constructor(dir: string, private readonly defaultCwd: string = process.cwd()) {
    this.store = new MemoryStore(dir)
  }

  /** Bir JSON-RPC mesajı işler; bildirimler için null döner. */
  handle(message: unknown): Record<string, unknown> | null {
    const request = (message && typeof message === 'object' ? message : {}) as JsonRpcRequest
    const id = request.id
    const isNotification = id === undefined
    const reply = (result: Record<string, unknown>): Record<string, unknown> | null =>
      isNotification ? null : { jsonrpc: '2.0', id, result }
    const fail = (code: number, messageText: string): Record<string, unknown> | null =>
      isNotification ? null : { jsonrpc: '2.0', id: id ?? null, error: { code, message: messageText } }

    switch (request.method) {
      case 'initialize': {
        const requested = request.params?.protocolVersion
        return reply({
          protocolVersion: typeof requested === 'string' ? requested : FALLBACK_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, title: 'TermFlow Lite Memory', version: '1.0.0' },
          instructions: INSTRUCTIONS
        })
      }
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: TOOLS })
      case 'tools/call':
        return reply(this.callTool(String(request.params?.name ?? ''), (request.params?.arguments ?? {}) as Record<string, unknown>))
      default:
        if (request.method?.startsWith('notifications/')) return null
        return fail(-32601, `Method not found: ${request.method ?? ''}`)
    }
  }

  callTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
    try {
      if (name === 'get_project_memory') return this.projectMemory(typeof args.cwd === 'string' && args.cwd.trim() ? args.cwd : this.defaultCwd)
      if (name === 'list_projects') return text(this.store.readIndex() ?? 'No project memory yet. Enable Agent Memory in TermFlow Lite settings.')
      if (name === 'search_memory') return this.search(String(args.query ?? ''))
      return text(`Unknown tool: ${name}`, true)
    } catch (error) {
      return text(`Memory could not be read: ${error instanceof Error ? error.message : String(error)}`, true)
    }
  }

  private projectMemory(cwd: string): Record<string, unknown> {
    const key = projectKey(cwd)
    const markdown = this.store.readProject(key)
    if (!markdown) {
      const known = this.store.listProjects().slice(0, 15).map((project) => `- ${project.path}`).join('\n')
      return text(`No memory for ${projectRoot(cwd)} yet (no summarized sessions in the last ${RETENTION_DAYS} days).${known ? `\nProjects with memory:\n${known}` : ''}`)
    }
    const meta = parseFrontmatter(markdown)
    const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
    return text([
      `# Project memory: ${meta.project ?? cwd}`,
      `Generated ${meta.generatedAt ?? '?'} from ${meta.sessions ?? '?'} sessions (latest ${meta.lastSessionAt ?? '?'}). Work after that time is not included; verify against the code.`,
      '',
      body
    ].join('\n'))
  }

  private search(query: string): Record<string, unknown> {
    const needle = query.trim().toLowerCase()
    if (!needle) return text('Empty query.', true)
    const hits: string[] = []
    let files: string[] = []
    try { files = readdirSync(this.store.projectsDir).filter((name) => name.endsWith('.md')) } catch { /* henüz hafıza yok */ }
    for (const name of files) {
      const markdown = readFileSync(join(this.store.projectsDir, name), 'utf8')
      const project = parseFrontmatter(markdown).project ?? name
      for (const line of markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').split(/\r?\n/)) {
        if (line.toLowerCase().includes(needle)) hits.push(`${project}: ${line.trim()}`)
        if (hits.length >= 50) break
      }
      if (hits.length >= 50) break
    }
    return text(hits.length ? hits.join('\n') : `No memory line contains "${query}".`)
  }
}

/** stdio döngüsü: satır başına bir JSON-RPC mesajı okur/yazar. */
export function serveStdio(server: MemoryMcpServer, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): void {
  let buffer = ''
  input.setEncoding?.('utf8')
  input.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString()
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      let response: Record<string, unknown> | null
      try {
        response = server.handle(JSON.parse(line))
      } catch {
        response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }
      }
      if (response) output.write(`${JSON.stringify(response)}\n`)
    }
  })
}
