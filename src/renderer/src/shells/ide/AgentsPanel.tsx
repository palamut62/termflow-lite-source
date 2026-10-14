import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Play, RefreshCw, Search } from 'lucide-react'
import type { AgentSession } from '../../../../shared/types'
import { useSettingsStore } from '../../store/settingsStore'
import { useTerminalStore } from '../../store/terminalStore'
import { agentProfileOptions, continueAgentSession } from '../../agentHandover'
import { relativeTime } from '../../components/AgentSessions'
import { isInside } from './ideTreeModel'

type Scope = 'workspace' | 'project' | 'all'
const LABELS = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode' } as const

/** Sag panel "Agents": gecmis ajan oturumlarini aktif worktree / proje / tumu kapsaminda sur (PRD 4.3). */
export function AgentsPanel(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const active = useTerminalStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const [sessions, setSessions] = useState<AgentSession[] | null>(null)
  const [scope, setScope] = useState<Scope>('workspace')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const profiles = useMemo(() => agentProfileOptions(settings), [settings])

  const refresh = (): void => {
    setSessions(null)
    setError('')
    void window.termflow.agentSessions.list({ limit: 200 }).then(setSessions).catch(() => { setSessions([]); setError('Sessions could not be read.') })
  }
  useEffect(refresh, [])

  const workspace = active?.worktree?.path || active?.cwd || active?.launchCwd || ''
  const project = active?.worktree?.repoRoot || workspace
  const filtered = (sessions ?? []).filter((session) => {
    if (scope !== 'all') {
      const base = scope === 'workspace' ? workspace : project
      if (!base || !session.cwd || !isInside(session.cwd, base)) return false
      // "Workspace": yalniz bu checkout, alt worktree'leri degil.
      if (scope === 'workspace' && /[\/]\.termflow-worktrees[\/]/i.test(session.cwd.slice(base.length))) return false
    }
    return `${session.title} ${session.cwd ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  })

  const resume = async (session: AgentSession): Promise<void> => {
    const target = profiles.find((p) => p.id === session.profileId) ?? profiles.find((p) => p.agent === session.agent)
    if (!target) { setError(`No ${LABELS[session.agent]} profile is set up.`); return }
    setBusy(`${session.agent}:${session.id}`)
    try {
      await continueAgentSession(session, target, session.cwd, settings.defaultAgentPermissionMode)
    } catch {
      setError('Session could not be resumed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="ide-agents">
      <div className="ide-segment" role="radiogroup" aria-label="Session scope">
        {(['workspace', 'project', 'all'] as Scope[]).map((value) => (
          <button key={value} role="radio" aria-checked={scope === value} className={scope === value ? 'ide-segment-on' : ''} onClick={() => setScope(value)}>
            {value === 'workspace' ? 'Workspace' : value === 'project' ? 'Project' : 'All'}
          </button>
        ))}
        <button className="ide-icon-btn" onClick={refresh} title="Refresh" aria-label="Refresh sessions"><RefreshCw size={12} /></button>
      </div>
      <label className="ide-search"><Search size={12} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Resume past sessions" aria-label="Search sessions" /></label>
      {error && <div className="ide-note ide-note-error">{error}</div>}
      {sessions === null && <div className="ide-note"><LoaderCircle size={12} className="ide-state-working" /> Loading sessions...</div>}
      {sessions !== null && filtered.length === 0 && <div className="ide-note">{scope === 'all' ? 'No agent sessions yet.' : 'No sessions here. Try Project or All.'}</div>}
      <ul className="ide-session-list">
        {filtered.map((session) => {
          const key = `${session.agent}:${session.id}`
          return (
            <li key={key}>
              <button className="ide-session-item" onClick={() => void resume(session)} disabled={busy === key} title={`Resume in a new tab\n${session.cwd ?? ''}`}>
                <span className="ide-session-title">{session.title || 'Untitled session'}</span>
                <span className="ide-session-meta">{LABELS[session.agent]} · {relativeTime(session.updatedAt)}</span>
                {busy === key ? <LoaderCircle size={12} className="ide-state-working" /> : <Play size={12} />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
