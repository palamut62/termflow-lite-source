import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { redactApiKeys } from '../../shared/secretRedaction'
import type { AgentKind } from '../../shared/types'

// Agent Memory dilim 1: bir session kaydından, modele gönderilecek kısa ve
// yerel bir özet (digest) çıkarır. Araç çıktıları (dosya içerikleri, komut
// çıktıları, MCP sonuçları) hiç alınmaz; bu hem boyutu hem de hafızanın kendi
// çıktısını yeniden özetleme döngüsünü engeller. Bkz. docs/agent-memory.md.

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export interface DigestTask {
  text: string
  status: TaskStatus
}

export interface DigestCheck {
  command: string
  ok: boolean
}

export interface SessionDigest {
  agent: AgentKind
  id: string
  cwd?: string
  startedAt?: number
  updatedAt?: number
  userMessages: string[]
  assistantMessages: string[]
  files: string[]
  commits: string[]
  checks: DigestCheck[]
  errors: string[]
  tasks: DigestTask[]
  /** Son tur cevapsız kaldıysa ya da kullanıcı tarafından kesildiyse true. */
  interrupted: boolean
}

const MAX_USER_MESSAGES = 200
const MAX_MESSAGE_CHARS = 1_000
const MAX_ASSISTANT_MESSAGES = 4
const MAX_ASSISTANT_CHARS = 1_500
const MAX_FILES = 200
const MAX_COMMITS = 30
const MAX_CHECKS = 15
const MAX_ERRORS = 8
const MAX_ERROR_CHARS = 240
export const MAX_DIGEST_CHARS = 10_000

// Projenin durumunu anlatan komutlar: test, build, lint, deploy, yayın.
const CHECK_COMMAND = /^(?:npm|pnpm|yarn|bun|npx|pytest|python3? -m pytest|uv run|ruff|cargo|go (?:test|build|vet)|dotnet|make|gradle|mvn|vercel|gh (?:pr|release)|git push|docker (?:build|compose))\b/

const CLAUDE_INJECTED = /^(?:<command-name>|<command-message>|<local-command-|<system-reminder>|<bash-|Caveat:|\[Request interrupted)/
const CODEX_INJECTED = /^(?:# AGENTS\.md instructions|<environment_context>|<user_instructions>|<app-context>|<permissions)/

const clip = (value: string, max: number): string => value.length > max ? `${value.slice(0, max - 1)}…` : value
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim()

function timestampFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function textParts(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    if (record.type === 'tool_result' || record.type === 'tool_use' || record.type === 'thinking') return []
    return typeof record.text === 'string' ? [record.text] : []
  }).join('\n')
}

/** Kullanıcı mesajından araçların eklediği bağlam bloklarını ayıklar. */
export function cleanUserText(raw: string): string {
  let text = raw
  const request = text.indexOf('## My request for Codex:')
  if (request >= 0) text = text.slice(request + '## My request for Codex:'.length)
  text = text
    .replace(/<(system-reminder|in-app-browser-context|environment_context|ide_selection|ide_opened_file)\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/&#x20;/g, ' ')
  return oneLine(text)
}

/** `git commit -m "..."` ya da heredoc mesajının ilk satırı. */
export function commitMessage(command: string): string | undefined {
  if (!/\bgit\b[^\n]*\bcommit\b/.test(command)) return undefined
  const heredoc = command.match(/<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\b/)
  const inline = command.match(/\s-m\s+(["'])([\s\S]*?)\1/)
  const message = heredoc?.[2] ?? inline?.[2]
  const first = message?.split('\n').map((line) => line.trim()).find(Boolean)
  return first ? clip(first, 160) : undefined
}

function normalizeStatus(value: unknown): TaskStatus | null {
  if (value === 'completed' || value === 'done') return 'completed'
  if (value === 'in_progress' || value === 'in-progress' || value === 'active') return 'in_progress'
  if (value === 'pending' || value === 'todo') return 'pending'
  return null
}

function tasksFrom(list: unknown, textKey: string): DigestTask[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((item): DigestTask[] => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const text = typeof record[textKey] === 'string' ? oneLine(record[textKey] as string) : ''
    const status = normalizeStatus(record.status)
    return text && status ? [{ text: clip(text, 200), status }] : []
  })
}

/** Ajan kayıtlarını tek tip bir özete toplar. Ajan başına `feed*` metotları var. */
export class DigestBuilder {
  readonly digest: SessionDigest
  // Claude TaskCreate/TaskUpdate: görev id'si araç sonucunda gelir.
  private readonly taskById = new Map<string, DigestTask>()
  private readonly pendingTaskCreates = new Map<string, string>()
  /** Claude Bash tool_use id -> komut (sonucu gelince başarı durumu eklenir). */
  private readonly toolUses = new Map<string, string>()
  // Codex yeni sürümlerde aynı bilgiyi hem response_item hem item_completed
  // olarak yazar. item_completed görülürse eski biçim yok sayılır.
  private codexEvents = false
  private legacy: DigestBuilder | null = null
  private lastWasUser = false

  constructor(agent: AgentKind, id = '') {
    this.digest = {
      agent, id, userMessages: [], assistantMessages: [], files: [], commits: [],
      checks: [], errors: [], tasks: [], interrupted: false
    }
  }

  private touch(timestamp: unknown): void {
    const time = timestampFrom(timestamp)
    if (time === undefined) return
    this.digest.startedAt = Math.min(this.digest.startedAt ?? time, time)
    this.digest.updatedAt = Math.max(this.digest.updatedAt ?? time, time)
  }

  addUser(raw: string): void {
    const text = cleanUserText(raw)
    if (!text) return
    const list = this.digest.userMessages
    if (list.length >= MAX_USER_MESSAGES) list.splice(1, 1)
    list.push(clip(text, MAX_MESSAGE_CHARS))
    this.lastWasUser = true
    this.digest.interrupted = true
  }

  addAssistant(raw: string): void {
    const text = oneLine(raw)
    if (!text) return
    const list = this.digest.assistantMessages
    list.push(clip(text, MAX_ASSISTANT_CHARS))
    if (list.length > MAX_ASSISTANT_MESSAGES) list.shift()
    this.lastWasUser = false
    this.digest.interrupted = false
  }

  markInterrupted(): void {
    this.digest.interrupted = true
  }

  touchFile(path: string, action: 'add' | 'update' | 'delete' = 'update'): void {
    if (!path) return
    const entry = action === 'update' ? path : `${path} (${action === 'add' ? 'new' : 'deleted'})`
    const list = this.digest.files
    const existing = list.findIndex((item) => item === path || item.startsWith(`${path} (`))
    if (existing >= 0) list.splice(existing, 1)
    list.push(entry)
    if (list.length > MAX_FILES) list.shift()
  }

  addCommand(command: string, ok: boolean, errorText = ''): void {
    const commit = commitMessage(command)
    if (commit && ok && !this.digest.commits.includes(commit)) {
      this.digest.commits.push(commit)
      if (this.digest.commits.length > MAX_COMMITS) this.digest.commits.shift()
    }
    const first = oneLine(command.split('\n')[0] ?? '')
    if (CHECK_COMMAND.test(first) && !commit) {
      const checks = this.digest.checks
      const short = clip(first, 140)
      const existing = checks.findIndex((check) => check.command === short)
      if (existing >= 0) checks.splice(existing, 1)
      checks.push({ command: short, ok })
      if (checks.length > MAX_CHECKS) checks.shift()
    }
    if (!ok) this.addError(`${clip(first, 100)}: ${errorText}`)
  }

  addError(text: string): void {
    const line = clip(oneLine(text), MAX_ERROR_CHARS)
    if (!line) return
    const errors = this.digest.errors
    const existing = errors.indexOf(line)
    if (existing >= 0) errors.splice(existing, 1)
    errors.push(line)
    if (errors.length > MAX_ERRORS) errors.shift()
  }

  replaceTasks(tasks: DigestTask[]): void {
    this.taskById.clear()
    this.digest.tasks = tasks
  }

  private syncTasks(): void {
    this.digest.tasks = [...this.taskById.values()]
  }

  feedClaude(item: Record<string, any>): void {
    if (typeof item.sessionId === 'string' && !this.digest.id) this.digest.id = item.sessionId
    if (item.isSidechain || item.isCompactSummary) return
    if (item.type !== 'user' && item.type !== 'assistant') return
    if (!this.digest.cwd && typeof item.cwd === 'string') this.digest.cwd = item.cwd
    this.touch(item.timestamp)
    const content = item.message?.content

    if (item.type === 'user') {
      if (Array.isArray(content)) {
        for (const part of content) if (part?.type === 'tool_result') this.claudeToolResult(part, item.toolUseResult)
      }
      if (item.isMeta) return
      const text = textParts(content).trim()
      if (text.startsWith('[Request interrupted')) this.markInterrupted()
      if (text && !CLAUDE_INJECTED.test(text)) this.addUser(text)
      return
    }

    if (!Array.isArray(content)) return
    for (const part of content) {
      if (part?.type === 'text' && typeof part.text === 'string') this.addAssistant(part.text)
      if (part?.type === 'tool_use') this.claudeToolUse(part)
    }
  }

  private claudeToolUse(part: Record<string, any>): void {
    const name = String(part.name ?? '')
    const input = (part.input ?? {}) as Record<string, any>
    const id = String(part.id ?? '')
    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) {
      const path = input.file_path ?? input.notebook_path
      if (typeof path === 'string') this.touchFile(path, name === 'Write' ? 'add' : 'update')
    }
    if (name === 'TodoWrite') this.replaceTasks(tasksFrom(input.todos, 'content'))
    if (name === 'TaskCreate' && typeof input.subject === 'string') this.pendingTaskCreates.set(id, oneLine(input.subject))
    if (name === 'TaskUpdate' && input.taskId !== undefined) {
      const key = String(input.taskId)
      const task = this.taskById.get(key)
      if (input.status === 'deleted') this.taskById.delete(key)
      else if (task) {
        task.status = normalizeStatus(input.status) ?? task.status
        if (typeof input.subject === 'string') task.text = clip(oneLine(input.subject), 200)
      }
      this.syncTasks()
    }
    if (name === 'Bash' && typeof input.command === 'string') this.toolUses.set(id, input.command)
  }

  private claudeToolResult(part: Record<string, any>, toolUseResult: unknown): void {
    const id = String(part.tool_use_id ?? '')
    const command = this.toolUses.get(id)
    const failed = part.is_error === true
    const text = textParts(part.content) || (typeof part.content === 'string' ? part.content : '')
    const subject = this.pendingTaskCreates.get(id)
    if (subject !== undefined) {
      this.pendingTaskCreates.delete(id)
      const resultId = (toolUseResult as { task?: { id?: unknown } } | undefined)?.task?.id
      const taskId = resultId !== undefined ? String(resultId) : text.match(/Task #(\w+)/)?.[1]
      if (taskId && !failed) {
        this.taskById.set(taskId, { text: clip(subject, 200), status: 'pending' })
        this.syncTasks()
      }
    }
    if (command === undefined) return
    this.toolUses.delete(id)
    // Yalnız kabuk komutlarının hataları tutulur; araç kullanım hataları
    // (Edit eşleşmedi, dosya yok vb.) projenin durumu hakkında bilgi vermez.
    this.addCommand(command, !failed, text.split('\n')[0] ?? '')
  }

  feedCodex(item: Record<string, any>): void {
    const payload = (item.payload ?? {}) as Record<string, any>
    this.touch(item.timestamp)
    if (item.type === 'session_meta') {
      if (typeof payload.id === 'string') this.digest.id = payload.id
      if (typeof payload.cwd === 'string') this.digest.cwd ??= payload.cwd
      this.touch(payload.timestamp)
      return
    }
    if (item.type === 'turn_context' && typeof payload.cwd === 'string') {
      this.digest.cwd ??= payload.cwd
      return
    }
    if (item.type === 'event_msg') return this.codexEvent(payload)
    if (item.type === 'response_item' && !this.codexEvents) {
      this.legacy ??= new DigestBuilder('codex')
      this.legacy.feedCodexLegacy(payload)
    }
  }

  private codexEvent(payload: Record<string, any>): void {
    if (payload.type === 'turn_aborted') return this.markInterrupted()
    if (payload.type !== 'item_completed') return
    const entry = (payload.item ?? {}) as Record<string, any>
    this.codexEvents = true
    this.legacy = null
    switch (entry.type) {
      case 'UserMessage': {
        const text = textParts(entry.content)
        if (text && !CODEX_INJECTED.test(text.trim())) this.addUser(text)
        break
      }
      case 'AgentMessage':
        if (entry.phase !== 'commentary') this.addAssistant(textParts(entry.content))
        break
      case 'CommandExecution': {
        const command = Array.isArray(entry.command) ? String(entry.command.at(-1) ?? '') : String(entry.command ?? '')
        const ok = entry.exit_code === 0 || (entry.exit_code === undefined && entry.status === 'completed')
        const stderr = typeof entry.stderr === 'string' && entry.stderr.trim() ? entry.stderr : String(entry.aggregated_output ?? '')
        this.addCommand(command, ok, stderr.trim().split('\n').at(-1) ?? '')
        break
      }
      case 'FileChange':
        for (const [path, change] of Object.entries((entry.changes ?? {}) as Record<string, any>)) {
          const kind = change?.type === 'add' || change?.type === 'delete' ? change.type : 'update'
          this.touchFile(path, kind)
        }
        break
    }
  }

  /** Eski Codex sürümleri: yalnız response_item kayıtları (ayrı builder'da toplanır). */
  feedCodexLegacy(payload: Record<string, any>): void {
    if (payload.type === 'message') {
      const text = textParts(payload.content)
      if (payload.role === 'user' && text && !CODEX_INJECTED.test(text.trim())) this.addUser(text)
      if (payload.role === 'assistant' && payload.phase !== 'commentary') this.addAssistant(text)
      return
    }
    if (payload.type !== 'function_call' && payload.type !== 'custom_tool_call') return
    const name = String(payload.name ?? '')
    const raw = typeof payload.arguments === 'string' ? payload.arguments : typeof payload.input === 'string' ? payload.input : ''
    let args: Record<string, any> = {}
    try { args = JSON.parse(raw) as Record<string, any> } catch { /* apply_patch girdisi düz metindir */ }
    if (name === 'update_plan') this.replaceTasks(tasksFrom(args.plan, 'step'))
    if (name === 'apply_patch' || raw.includes('*** Begin Patch')) {
      for (const match of raw.matchAll(/\*\*\* (Add|Update|Delete) File: (.+)/g)) {
        const action = match[1] === 'Add' ? 'add' : match[1] === 'Delete' ? 'delete' : 'update'
        this.touchFile(match[2].trim(), action)
      }
    }
    if ((name === 'shell' || name === 'exec_command') && (args.command || args.cmd)) {
      const command = Array.isArray(args.command) ? String(args.command.at(-1) ?? '') : String(args.command ?? args.cmd)
      const commit = commitMessage(command)
      if (commit && !this.digest.commits.includes(commit)) this.digest.commits.push(commit)
    }
  }

  /** `opencode export <id>` çıktısı. */
  feedOpenCodeExport(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const root = value as Record<string, any>
    const info = (root.info ?? {}) as Record<string, any>
    if (typeof info.id === 'string') this.digest.id = info.id
    if (typeof info.directory === 'string') this.digest.cwd = info.directory
    this.touch(info.time?.created)
    this.touch(info.time?.updated)
    if (!Array.isArray(root.messages)) return
    for (const message of root.messages as Array<Record<string, any>>) {
      const meta = (message.info ?? {}) as Record<string, any>
      this.touch(meta.time?.created)
      this.touch(meta.time?.completed)
      if (meta.summary === true || meta.mode === 'compaction') continue
      const parts = Array.isArray(message.parts) ? message.parts as Array<Record<string, any>> : []
      const text = parts.filter((part) => part?.type === 'text' && !part.synthetic).map((part) => String(part.text ?? '')).join('\n')
      if (meta.role === 'user') this.addUser(text)
      if (meta.role === 'assistant') {
        if (text) this.addAssistant(text)
        if (meta.error) this.markInterrupted()
      }
      for (const part of parts) if (part?.type === 'tool') this.openCodeTool(part)
    }
  }

  private openCodeTool(part: Record<string, any>): void {
    const tool = String(part.tool ?? '')
    const state = (part.state ?? {}) as Record<string, any>
    const input = (state.input ?? {}) as Record<string, any>
    const failed = state.status === 'error'
    if (['edit', 'write', 'patch', 'multiedit'].includes(tool) && typeof input.filePath === 'string') {
      this.touchFile(input.filePath, tool === 'write' ? 'add' : 'update')
    }
    if (tool === 'todowrite') this.replaceTasks(tasksFrom(input.todos, 'content'))
    if (tool === 'bash' && typeof input.command === 'string') {
      const exit = state.metadata?.exit
      this.addCommand(input.command, !failed && (exit === undefined || exit === 0), String(state.error ?? ''))
    }
  }

  finish(): SessionDigest {
    if (this.legacy) {
      const { userMessages, assistantMessages, files, commits, tasks, interrupted } = this.legacy.finish()
      Object.assign(this.digest, { userMessages, assistantMessages, files, commits, tasks, interrupted })
    }
    if (this.lastWasUser) this.digest.interrupted = true
    const cwd = this.digest.cwd
    if (cwd) this.digest.files = this.digest.files.map((file) => relativeTo(cwd, file))
    return this.digest
  }
}

function relativeTo(cwd: string, file: string): string {
  const norm = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const base = norm(cwd)
  const path = norm(file)
  const windows = /^[A-Za-z]:\//.test(base)
  const same = windows ? path.toLowerCase().startsWith(`${base.toLowerCase()}/`) : path.startsWith(`${base}/`)
  return same ? path.slice(base.length + 1) : file
}

/** Claude ya da Codex jsonl dosyasını satır satır okuyup özet üretir. */
export async function digestFromJsonl(file: string, agent: 'claude' | 'codex', id = ''): Promise<SessionDigest> {
  const builder = new DigestBuilder(agent, id)
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (!line) continue
      let item: Record<string, any>
      try { item = JSON.parse(line) as Record<string, any> } catch { continue }
      if (agent === 'claude') builder.feedClaude(item)
      else builder.feedCodex(item)
    }
  } finally {
    lines.close()
  }
  return builder.finish()
}

export function digestFromOpenCodeExport(value: unknown): SessionDigest {
  const builder = new DigestBuilder('opencode')
  builder.feedOpenCodeExport(value)
  return builder.finish()
}

/** Kullanıcı mesajları: ilk ikisi (amaç) her zaman, kalan bütçe en sondakilere. */
function pickUserMessages(messages: string[], budget: number): string[] {
  const head = messages.slice(0, 2)
  const tail: string[] = []
  let used = head.reduce((sum, text) => sum + text.length + 4, 0)
  for (let index = messages.length - 1; index >= head.length; index--) {
    const cost = messages[index].length + 4
    if (used + cost > budget) break
    tail.unshift(messages[index])
    used += cost
  }
  const skipped = messages.length - head.length - tail.length
  return skipped > 0 ? [...head, `(${skipped} messages omitted)`, ...tail] : [...head, ...tail]
}

function section(title: string, lines: string[], budget: number): string {
  if (!lines.length) return ''
  let body = ''
  for (const line of lines) {
    if (body.length + line.length + 1 > budget) {
      body += '…\n'
      break
    }
    body += `${line}\n`
  }
  return `## ${title}\n${body}`
}

const isoMinute = (time?: number): string => time ? new Date(time).toISOString().slice(0, 16).replace('T', ' ') : '?'

/** Modele gönderilecek metin. Sırlar maskelenir, toplam boyut sınırlıdır. */
export function renderDigest(digest: SessionDigest, maxChars = MAX_DIGEST_CHARS): string {
  const mark: Record<TaskStatus, string> = { completed: '[x]', in_progress: '[~]', pending: '[ ]' }
  const header = [
    `Agent: ${digest.agent} | Session: ${digest.id || '?'}`,
    `Project: ${digest.cwd ?? '?'}`,
    `Time: ${isoMinute(digest.startedAt)} -> ${isoMinute(digest.updatedAt)} UTC | Ended: ${digest.interrupted ? 'interrupted or unanswered' : 'answered'}`
  ].join('\n')
  const parts = [
    header,
    section('User requests', pickUserMessages(digest.userMessages, 3_800).map((text, index) => `${index + 1}. ${text}`), 4_000),
    section('Last assistant messages', digest.assistantMessages, 2_400),
    section('Tasks (last known state)', digest.tasks.map((task) => `${mark[task.status]} ${task.text}`), 1_200),
    section(`Files changed (${digest.files.length})`, [...digest.files].reverse(), 800),
    section('Commits', digest.commits.map((commit) => `- ${commit}`), 600),
    section('Checks', digest.checks.map((check) => `- ${check.command} -> ${check.ok ? 'ok' : 'failed'}`), 500),
    section('Command failures (often transient)', digest.errors.map((error) => `- ${error}`), 700)
  ].filter(Boolean)
  return clip(redactApiKeys(parts.join('\n')), maxChars)
}

/** Özetlenecek kadar içerik var mı (boş/selamlaşma session'larını atlamak için). */
export function isMeaningful(digest: SessionDigest): boolean {
  const userChars = digest.userMessages.join(' ').length
  return digest.files.length > 0 || digest.commits.length > 0 || digest.tasks.length > 0 || userChars >= 40 || digest.userMessages.length >= 3
}
