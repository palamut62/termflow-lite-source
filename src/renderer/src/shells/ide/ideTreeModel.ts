import type { AgentKind, TerminalTab } from '../../../../shared/types'
import type { WorktreeEntry } from '../../../../shared/ipc'
import { pathLabel } from '../../sessionRail'

/**
 * Agent IDE sol agaci (docs/agent-ide/PRD.md F1.2): proje > worktree > oturum.
 * Saf fonksiyon: store'lardan turetilir, kendi durumu yok.
 */
export type SessionState = 'working' | 'needs-input' | 'done' | 'error' | 'idle'

export interface IdeSession {
  tabId: string
  title: string
  agent: AgentKind | null
  state: SessionState
  /** Bu durumun basladigi an (epoch ms); "6m" gibi gosterilir. */
  since: number
  active: boolean
}

export interface IdeWorktree {
  path: string
  /** null: dal yok (detached HEAD ya da git olmayan klasor). */
  branch: string | null
  /** Deponun ana checkout'u. */
  primary: boolean
  sessions: IdeSession[]
}

export interface IdeProject {
  root: string
  label: string
  worktrees: IdeWorktree[]
}

export interface IdeTreeInput {
  /** Kullanicinin ekledigi projeler (depo kokleri ya da klasorler), siraya gore. */
  projects: readonly string[]
  /** Proje koku -> `git worktree list` (bilinmiyorsa yok). */
  worktrees: ReadonlyMap<string, readonly WorktreeEntry[]>
  /** Sekme klasoru -> depo koku (SessionRail ile ayni cozumleme). */
  repoRoots: ReadonlyMap<string, string>
  tabs: readonly TerminalTab[]
  activeTabId: string | null
  agentOf: (tab: TerminalTab) => AgentKind | null
  /** agent-hooks acik mi (ayar). */
  hooked?: boolean
}

const norm = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** `child` `parent`in kendisi ya da altinda mi (Windows'ta buyuk/kucuk harf duyarsiz). */
export function isInside(child: string, parent: string): boolean {
  const c = norm(child)
  const p = norm(parent)
  return c === p || c.startsWith(`${p}/`)
}

/**
 * `hooked`: ajan durumunu kendisi bildiriyor (agent-hooks acik, Claude/Codex). O zaman ilk olaydan once
 * ajan prompt bekliyordur; cikti tahminine bakilmaz (ilk acilista "Working" gorunmesin).
 */
export function sessionState(tab: TerminalTab, agent: AgentKind | null, hooked = false): SessionState {
  if (tab.agentHook) return tab.agentHook.state === 'idle' ? 'idle' : tab.agentHook.state
  if (tab.activity === 'error') return 'error'
  if (hooked && (agent === 'claude' || agent === 'codex')) return 'idle'
  if (tab.activity === 'running' || tab.activity === 'unread') return agent ? 'working' : 'idle'
  return 'idle'
}

function tabPath(tab: TerminalTab): string {
  return tab.worktree?.path || tab.cwd || tab.launchCwd || ''
}

export function buildIdeTree(input: IdeTreeInput): IdeProject[] {
  const roots: string[] = []
  const seen = new Set<string>()
  const add = (root: string): void => {
    if (!root || seen.has(norm(root))) return
    seen.add(norm(root))
    roots.push(root)
  }
  input.projects.forEach(add)
  // Acik sekmenin projesi listede olmasa da gorunur (bir oturum agactan hic kaybolmaz).
  for (const tab of input.tabs) {
    const path = tabPath(tab)
    if (!path || roots.some((root) => isInside(path, root))) continue
    add(tab.worktree?.repoRoot || input.repoRoots.get(tab.launchCwd || tab.cwd || '') || path)
  }

  const projects: IdeProject[] = roots.map((root) => {
    const listed = input.worktrees.get(root) ?? []
    const worktrees: IdeWorktree[] = listed.filter((w) => !w.bare).map((w) => ({
      path: w.path,
      branch: w.branch,
      primary: norm(w.path) === norm(root),
      sessions: []
    }))
    if (!worktrees.some((w) => w.primary)) worktrees.unshift({ path: root, branch: null, primary: true, sessions: [] })
    worktrees.sort((a, b) => Number(b.primary) - Number(a.primary))
    return { root, label: pathLabel(root), worktrees }
  })

  for (const tab of input.tabs) {
    const path = tabPath(tab)
    if (!path) continue
    // En derin eslesen worktree (ic ice klasorlerde dogru checkout).
    let best: IdeWorktree | null = null
    for (const project of projects) {
      for (const worktree of project.worktrees) {
        if (isInside(path, worktree.path) && (!best || norm(worktree.path).length > norm(best.path).length)) best = worktree
      }
    }
    if (!best) continue
    const agent = input.agentOf(tab)
    best.sessions.push({
      tabId: tab.id,
      title: tab.title,
      agent,
      state: sessionState(tab, agent, input.hooked),
      since: tab.agentHook?.at ?? tab.busySince ?? tab.startedAt,
      active: tab.id === input.activeTabId
    })
  }
  return projects
}

/** Agacin ozeti: en acil durum (kapali proje basliginda gosterilir). */
const URGENCY: SessionState[] = ['needs-input', 'error', 'working', 'done']

export function mostUrgent(sessions: readonly IdeSession[]): SessionState | null {
  return URGENCY.find((state) => sessions.some((s) => s.state === state)) ?? null
}

export function formatAge(since: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - since) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}
