import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AgentKind } from '../../shared/types'
import { projectSlug } from './projectKey'

// Electron'a bağımlı değil: MCP sunucusu proje dosyalarını buradan okur.
//
// <dir>/sessions/<agent>-<id>.json   session özeti (+ kaynak dosyanın mtime/size'ı)
// <dir>/projects/<slug>.md           proje hafızası (frontmatter + bölümler)
// <dir>/index.md                     proje listesi
// <dir>/state.json                   son çalışma bilgisi

export const RETENTION_DAYS = 30
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

export interface SessionSummary {
  goal: string
  done: string[]
  unfinished: string[]
  problems: string[]
  decisions: string[]
  lastState: string
}

export interface StoredSession {
  agent: AgentKind
  id: string
  /** Kaynak değişti mi kontrolü için; değişmediyse yeniden özetlenmez. */
  source: { mtime: number; size: number }
  updatedAt: number
  startedAt?: number
  projectKey?: string
  projectPath?: string
  files?: string[]
  interrupted?: boolean
  /** null: özetlenecek kadar içerik yoktu (selamlaşma vb.). */
  summary: SessionSummary | null
}

export interface ProjectMeta {
  key: string
  path: string
  slug: string
  generatedAt: number
  lastSessionAt: number
  sessions: number
  status: string
}

export interface MemoryState {
  lastRunAt?: number
  lastError?: string
  usage?: { promptTokens: number; completionTokens: number; requests: number; cost?: number }
}

const SAFE_ID = /[^A-Za-z0-9._-]+/g

export function sessionFileName(agent: AgentKind, id: string): string {
  return `${agent}-${id.replace(SAFE_ID, '_').slice(0, 120)}.json`
}

function writeAtomic(file: string, content: string): void {
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, content, 'utf8')
  renameSync(temp, file)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

/** Frontmatter'daki `anahtar: değer` satırları. */
export function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return result
}

/** `## Status` bölümünün ilk satırı (index ve arayüz için). */
export function statusLine(markdown: string): string {
  const match = markdown.match(/^##\s+Status\s*\r?\n+([^\n]+)/m)
  return match ? match[1].replace(/^[-*]\s*/, '').trim().slice(0, 200) : ''
}

export class MemoryStore {
  readonly sessionsDir: string
  readonly projectsDir: string

  constructor(readonly dir: string) {
    this.sessionsDir = join(dir, 'sessions')
    this.projectsDir = join(dir, 'projects')
  }

  private ensure(): void {
    mkdirSync(this.sessionsDir, { recursive: true })
    mkdirSync(this.projectsDir, { recursive: true })
  }

  getSession(agent: AgentKind, id: string): StoredSession | null {
    return readJson<StoredSession>(join(this.sessionsDir, sessionFileName(agent, id)))
  }

  putSession(session: StoredSession): void {
    this.ensure()
    writeAtomic(join(this.sessionsDir, sessionFileName(session.agent, session.id)), JSON.stringify(session))
  }

  listSessions(): StoredSession[] {
    if (!existsSync(this.sessionsDir)) return []
    return readdirSync(this.sessionsDir)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        const session = readJson<StoredSession>(join(this.sessionsDir, name))
        return session && typeof session.updatedAt === 'number' ? [session] : []
      })
  }

  /** 30 günden eski ya da hariç tutulan projelere ait özetleri siler; etkilenen projeleri döndürür. */
  prune(now: number, excluded: Set<string> = new Set()): Set<string> {
    const affected = new Set<string>()
    const cutoff = now - RETENTION_MS
    for (const session of this.listSessions()) {
      const excludedProject = session.projectKey !== undefined && excluded.has(session.projectKey)
      if (session.updatedAt >= cutoff && !excludedProject) continue
      rmSync(join(this.sessionsDir, sessionFileName(session.agent, session.id)), { force: true })
      if (session.projectKey) affected.add(session.projectKey)
    }
    return affected
  }

  sessionsForProject(key: string): StoredSession[] {
    return this.listSessions()
      .filter((session) => session.projectKey === key && session.summary)
      .sort((a, b) => a.updatedAt - b.updatedAt)
  }

  projectFile(key: string): string {
    return join(this.projectsDir, `${projectSlug(key)}.md`)
  }

  writeProject(key: string, markdown: string): void {
    this.ensure()
    writeAtomic(this.projectFile(key), markdown)
  }

  readProject(key: string): string | null {
    try {
      return readFileSync(this.projectFile(key), 'utf8')
    } catch {
      return null
    }
  }

  deleteProject(key: string): void {
    rmSync(this.projectFile(key), { force: true })
  }

  listProjects(): ProjectMeta[] {
    if (!existsSync(this.projectsDir)) return []
    return readdirSync(this.projectsDir)
      .filter((name) => name.endsWith('.md'))
      .flatMap((name): ProjectMeta[] => {
        let markdown: string
        try { markdown = readFileSync(join(this.projectsDir, name), 'utf8') } catch { return [] }
        const meta = parseFrontmatter(markdown)
        if (!meta.key) return []
        return [{
          key: meta.key,
          path: meta.project || meta.key,
          slug: name.slice(0, -3),
          generatedAt: Date.parse(meta.generatedAt) || 0,
          lastSessionAt: Date.parse(meta.lastSessionAt) || 0,
          sessions: Number(meta.sessions) || 0,
          status: statusLine(markdown)
        }]
      })
      .sort((a, b) => b.lastSessionAt - a.lastSessionAt)
  }

  writeIndex(now: number): void {
    this.ensure()
    const projects = this.listProjects()
    const lines = [
      '# TermFlow agent memory',
      '',
      `Updated: ${new Date(now).toISOString()} | Window: last ${RETENTION_DAYS} days | Projects: ${projects.length}`,
      '',
      ...projects.map((project) =>
        `- ${project.path} | last activity ${new Date(project.lastSessionAt).toISOString().slice(0, 10)} | ${project.sessions} sessions${project.status ? ` | ${project.status}` : ''}`)
    ]
    writeAtomic(join(this.dir, 'index.md'), `${lines.join('\n')}\n`)
  }

  readIndex(): string | null {
    try {
      return readFileSync(join(this.dir, 'index.md'), 'utf8')
    } catch {
      return null
    }
  }

  getState(): MemoryState {
    return readJson<MemoryState>(join(this.dir, 'state.json')) ?? {}
  }

  setState(patch: MemoryState): MemoryState {
    this.ensure()
    const next = { ...this.getState(), ...patch }
    writeAtomic(join(this.dir, 'state.json'), JSON.stringify(next))
    return next
  }

  /** Bir projeye ait tüm veriyi siler (hariç tutma). */
  forgetProject(key: string): void {
    for (const session of this.listSessions()) {
      if (session.projectKey === key) unlinkSync(join(this.sessionsDir, sessionFileName(session.agent, session.id)))
    }
    this.deleteProject(key)
  }

  clear(): void {
    rmSync(this.dir, { recursive: true, force: true })
  }
}
