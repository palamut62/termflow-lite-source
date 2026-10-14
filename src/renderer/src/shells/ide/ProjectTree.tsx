import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDot, GitBranch, LoaderCircle, Plus } from 'lucide-react'
import type { WorktreeEntry } from '../../../../shared/ipc'
import { agentForProfile } from '../../../../shared/profiles'
import { resolveDefaultProfileId, useSettingsStore } from '../../store/settingsStore'
import { useTerminalStore } from '../../store/terminalStore'
import { useToastStore } from '../../store/toastStore'
import { TabIcon } from '../../tabs/TabIcon'
import { useRepoRoots } from '../../useRepoRoots'
import { buildIdeTree, formatAge, mostUrgent, type IdeProject, type IdeSession, type IdeWorktree, type SessionState } from './ideTreeModel'

const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' } as const
const STATE_LABELS: Record<SessionState, string> = { working: 'Working', 'needs-input': 'Needs input', done: 'Done', error: 'Error', idle: 'Idle' }

function StateIcon({ state }: { state: SessionState }): React.JSX.Element {
  if (state === 'working') return <LoaderCircle size={12} className="ide-state ide-state-working" aria-hidden="true" />
  if (state === 'needs-input') return <CircleDot size={12} className="ide-state ide-state-needs-input" aria-hidden="true" />
  if (state === 'error') return <CircleAlert size={12} className="ide-state ide-state-error" aria-hidden="true" />
  if (state === 'done') return <CircleCheck size={12} className="ide-state ide-state-done" aria-hidden="true" />
  return <span className="ide-state ide-state-idle" aria-hidden="true" />
}

interface TreeMenu { x: number; y: number; project: IdeProject; worktree?: IdeWorktree }

/** Proje > worktree > oturum agaci (PRD F1.2). Durumlar store'dan canli turetilir. */
export function ProjectTree(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const settings = useSettingsStore((s) => s.settings)
  const repoRoots = useRepoRoots(tabs)
  const [worktrees, setWorktrees] = useState<Map<string, WorktreeEntry[]>>(new Map())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<TreeMenu | null>(null)
  const [now, setNow] = useState(Date.now())

  const tree = useMemo(() => buildIdeTree({
    projects: settings.ide.projects,
    worktrees,
    repoRoots,
    tabs,
    activeTabId,
    agentOf: (tab) => agentForProfile(settings, tab.profileId),
    hooked: settings.agentHooks
  }), [settings, worktrees, repoRoots, tabs, activeTabId])

  // Worktree listeleri: proje ya da sekme worktree'leri degisince ve pencere odaklaninca yenilenir.
  const rootsKey = tree.map((p) => p.root).join('|') + '#' + tabs.map((t) => t.worktree?.path ?? '').join('|')
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const next = new Map<string, WorktreeEntry[]>()
      for (const root of rootsKey.split('#')[0].split('|').filter(Boolean)) {
        next.set(root, await window.termflow.worktree.list(root).catch(() => []))
      }
      if (!cancelled) setWorktrees(next)
    }
    void load()
    window.addEventListener('focus', load)
    return () => { cancelled = true; window.removeEventListener('focus', load) }
  }, [rootsKey])

  // "6m" yaslari dakikada bir tazelenir.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close) }
  }, [menu])

  const toggle = (key: string): void => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  /** Worktree'ye tiklaninca: oturumu varsa ilkine gider, yoksa o klasorde yeni sekme acar. */
  const openWorktree = (worktree: IdeWorktree): void => {
    const first = worktree.sessions[0]
    if (first) { useTerminalStore.getState().setActiveTab(first.tabId); return }
    const { settings: current, shells } = useSettingsStore.getState()
    useTerminalStore.getState().addTab(resolveDefaultProfileId(current, shells), true, worktree.path)
  }

  const removeProject = (root: string): void => {
    const ide = useSettingsStore.getState().settings.ide
    void useSettingsStore.getState().update({ ide: { ...ide, projects: ide.projects.filter((p) => p !== root) } })
  }

  // Yukari/asagi ok: agac satirlari arasinda odak (role=tree).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-tree-row]')]
    const index = rows.indexOf(document.activeElement as HTMLElement)
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) { next.focus(); e.preventDefault() }
  }

  if (tree.length === 0) {
    return (
      <div className="ide-tree-empty">
        <p>Add a project folder to see its worktrees and agents here.</p>
        <button className="settings-btn" onClick={() => void addProject()}><Plus size={13} /> Add project folder</button>
      </div>
    )
  }

  return (
    <div className="ide-tree" role="tree" aria-label="Projects" onKeyDown={onKeyDown}>
      {tree.map((project) => {
        const isCollapsed = collapsed.has(project.root)
        const urgent = mostUrgent(project.worktrees.flatMap((w) => w.sessions))
        return (
          <div key={project.root} role="treeitem" aria-expanded={!isCollapsed} aria-label={project.label}>
            <button
              data-tree-row
              className="ide-tree-project"
              title={project.root}
              onClick={() => toggle(project.root)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, project }) }}
            >
              <span className="ide-avatar" style={{ background: avatarColor(project.label) }} aria-hidden="true">{project.label.slice(0, 1).toUpperCase()}</span>
              <span className="ide-tree-label">{project.label}</span>
              {isCollapsed ? <ChevronRight size={12} className="ide-chevron" /> : <ChevronDown size={12} className="ide-chevron" />}
              {isCollapsed && urgent && <StateIcon state={urgent} />}
            </button>
            {!isCollapsed && (
              <PrimaryCard
                project={project}
                now={now}
                onOpen={openWorktree}
                onMenu={(e, worktree) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, project, worktree }) }}
              />
            )}
          </div>
        )
      })}
      {menu && <TreeContextMenu menu={menu} onClose={() => setMenu(null)} onRemoveProject={removeProject} onOpenHere={(path) => {
        const { settings: current, shells } = useSettingsStore.getState()
        useTerminalStore.getState().addTab(resolveDefaultProfileId(current, shells), true, path)
      }} />}
    </div>
  )
}

const DOT: Record<SessionState, string> = { working: 'ide-dot-working', 'needs-input': 'ide-dot-needs-input', error: 'ide-dot-error', done: 'ide-dot-done', idle: 'ide-dot-idle' }

/** Projenin rengi: ada gore sabit, tema bagimsiz (Orca'daki proje avatari). */
function avatarColor(label: string): string {
  let hash = 0
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 55% 42%)`
}

function worktreeName(worktree: IdeWorktree): string {
  const folder = worktree.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? worktree.path
  return worktree.primary ? worktree.branch ?? folder : folder
}

/** Ana checkout karti; diger worktree'ler "N child" ile icinde acilir (Orca). */
function PrimaryCard({ project, now, onOpen, onMenu }: {
  project: IdeProject
  now: number
  onOpen: (worktree: IdeWorktree) => void
  onMenu: (e: React.MouseEvent, worktree: IdeWorktree) => void
}): React.JSX.Element {
  const [primary, ...children] = project.worktrees
  const [childrenOpen, setChildrenOpen] = useState(true)
  return (
    <div role="group" className="ide-card">
      <WorktreeHeader worktree={primary} onOpen={() => onOpen(primary)} onMenu={(e) => onMenu(e, primary)} />
      {children.length > 0 && (
        <button className="ide-child-chip" onClick={() => setChildrenOpen((v) => !v)} aria-expanded={childrenOpen}>
          <GitBranch size={11} /> {children.length} {children.length === 1 ? 'child' : 'children'} {childrenOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      )}
      {primary.sessions.map((session) => <SessionRow key={session.tabId} session={session} now={now} />)}
      {childrenOpen && children.map((worktree) => (
        <div key={worktree.path} role="group" className="ide-card ide-card-child">
          <WorktreeHeader worktree={worktree} onOpen={() => onOpen(worktree)} onMenu={(e) => onMenu(e, worktree)} />
          {worktree.sessions.map((session) => <SessionRow key={session.tabId} session={session} now={now} />)}
        </div>
      ))}
    </div>
  )
}

function WorktreeHeader({ worktree, onOpen, onMenu }: { worktree: IdeWorktree; onOpen: () => void; onMenu: (e: React.MouseEvent) => void }): React.JSX.Element {
  const name = worktreeName(worktree)
  const state = mostUrgent(worktree.sessions) ?? (worktree.sessions.length ? 'idle' : null)
  return (
    <button data-tree-row role="treeitem" aria-label={name} className="ide-tree-worktree" title={worktree.path} onClick={onOpen} onContextMenu={onMenu}>
      <span className="ide-tree-worktree-line">
        <span className={`ide-dot ${state ? DOT[state] : 'ide-dot-none'}`} aria-hidden="true" />
        <span className="ide-tree-label ide-tree-name">{name}</span>
        {worktree.primary && <span className="ide-badge">primary</span>}
      </span>
      <span className="ide-tree-branch">{worktree.branch ?? 'no branch'}</span>
    </button>
  )
}

function SessionRow({ session, now }: { session: IdeSession; now: number }): React.JSX.Element {
  const profileId = useTerminalStore((s) => s.tabs.find((t) => t.id === session.tabId)?.profileId ?? '')
  const who = session.agent ? AGENT_NAMES[session.agent] : session.title
  const label = session.agent ? `${STATE_LABELS[session.state]} - ${who}` : who
  return (
    <button
      data-tree-row
      role="treeitem"
      aria-selected={session.active}
      aria-label={`${label}, ${formatAge(session.since, now)}`}
      className={`ide-tree-session ide-session-${session.state}${session.active ? ' ide-tree-active' : ''}`}
      onClick={() => useTerminalStore.getState().setActiveTab(session.tabId)}
      title={session.title}
    >
      <StateIcon state={session.state} />
      <TabIcon shellId={profileId} />
      <span className="ide-tree-label">{label}</span>
      <span className="ide-tree-age">{formatAge(session.since, now)}</span>
    </button>
  )
}

function TreeContextMenu({ menu, onClose, onRemoveProject, onOpenHere }: { menu: TreeMenu; onClose: () => void; onRemoveProject: (root: string) => void; onOpenHere: (path: string) => void }): React.JSX.Element {
  const path = menu.worktree?.path ?? menu.project.root
  const act = (fn: () => void) => (e: React.MouseEvent): void => { e.stopPropagation(); fn(); onClose() }
  const removable = menu.worktree && !menu.worktree.primary
  return (
    <div className="ctx-menu" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
      <button className="ctx-menu-item" role="menuitem" onClick={act(() => onOpenHere(path))}>New Terminal Here</button>
      <button className="ctx-menu-item" role="menuitem" onClick={act(() => void window.termflow.system.revealInFolder(path))}>Reveal in Explorer</button>
      <button className="ctx-menu-item" role="menuitem" onClick={act(() => void navigator.clipboard.writeText(path).catch(() => undefined))}>Copy Path</button>
      {removable && (
        <button className="ctx-menu-item" role="menuitem" onClick={act(() => useTerminalStore.setState({ pendingWorktreeCleanup: { path: menu.worktree!.path, branch: menu.worktree!.branch ?? '', repoRoot: menu.project.root, createdByApp: true } }))}>
          Remove Worktree...
        </button>
      )}
      {!menu.worktree && (
        <>
          <div className="ctx-menu-divider" />
          <button className="ctx-menu-item" role="menuitem" onClick={act(() => onRemoveProject(menu.project.root))}>Remove from Projects</button>
        </>
      )}
    </div>
  )
}

/** Klasor sec, depo kokune cevir, listeye ekle. */
export async function addProject(): Promise<void> {
  const picked = await window.termflow.dialog.openDir()
  if (!picked) return
  const root = (await window.termflow.worktree.repoInfo(picked).catch(() => null))?.root ?? picked
  const ide = useSettingsStore.getState().settings.ide
  if (ide.projects.includes(root)) { useToastStore.getState().show('This project is already in the list.', 'info'); return }
  await useSettingsStore.getState().update({ ide: { ...ide, projects: [...ide.projects, root] } })
}
