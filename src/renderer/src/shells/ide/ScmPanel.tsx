import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleCheck, CircleDashed, CircleX, CloudUpload, FileDiff, GitPullRequest, LoaderCircle, Minus, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'
import type { ScmAction, ScmChecks, ScmFile, ScmState } from '../../../../shared/ipc'
import { useTerminalStore } from '../../store/terminalStore'
import { useToastStore } from '../../store/toastStore'
import { IdeMenu, MenuItem, anchorOf, type MenuAnchor } from './IdeMenu'
import { useIdePageStore } from './pages/idePageStore'

/** Sag panelin izledigi klasor: aktif sekmenin worktree'si ya da klasoru (AgentsPanel ile ayni kural). */
function useWorkspaceCwd(): string {
  return useTerminalStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId)
    return active?.worktree?.path || active?.cwd || active?.launchCwd || ''
  })
}

const staged = (f: ScmFile): boolean => f.index !== ' ' && f.index !== '?'
const unstaged = (f: ScmFile): boolean => f.work !== ' '
const letter = (code: string): string => (code === '?' ? 'U' : code)
const fail = (error: string): void => useToastStore.getState().show(error, 'error')

function FileRow({ file, code, action, onAction, cwd }: { file: ScmFile; code: string; action: 'stage' | 'unstage'; onAction: (a: ScmAction) => void; cwd: string }): React.JSX.Element {
  const shown = file.path.replace(/\/$/, '') // takip edilmeyen klasor `dir/` gelir
  const slash = shown.lastIndexOf('/')
  return (
    <li className="ide-scm-file">
      <button className="ide-scm-name" onClick={() => useIdePageStore.getState().open('review', { cwd, file: file.path })} title={`${file.path}\nShow changes`}>
        <span>{shown.slice(slash + 1)}</span>
        {slash > 0 && <small>{shown.slice(0, slash)}</small>}
      </button>
      <button className="ide-icon-btn ide-scm-act" onClick={() => onAction({ kind: action, paths: [file.path] })} title={action === 'stage' ? 'Stage' : 'Unstage'} aria-label={`${action === 'stage' ? 'Stage' : 'Unstage'} ${file.path}`}>
        {action === 'stage' ? <Plus size={13} /> : <Minus size={13} />}
      </button>
      <span className={`ide-scm-code ide-scm-${letter(code)}`}>{letter(code)}</span>
    </li>
  )
}

function FileGroup({ title, files, action, tree, onAction, cwd }: { title: string; files: ScmFile[]; action: 'stage' | 'unstage'; tree: boolean; onAction: (a: ScmAction) => void; cwd: string }): React.JSX.Element | null {
  const [open, setOpen] = useState(true)
  if (files.length === 0) return null
  const sorted = tree ? [...files].sort((a, b) => a.path.localeCompare(b.path)) : files
  let lastDir = ''
  return (
    <section className="ide-scm-group">
      <div className="ide-scm-group-head">
        <button onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{title}</button>
        <button className="ide-icon-btn" onClick={() => onAction({ kind: action, paths: files.map((f) => f.path) })} title={action === 'stage' ? 'Stage all' : 'Unstage all'} aria-label={action === 'stage' ? 'Stage all changes' : 'Unstage all changes'}>
          {action === 'stage' ? <Plus size={13} /> : <Minus size={13} />}
        </button>
        <span className="ide-count">{files.length}</span>
      </div>
      {open && (
        <ul>
          {sorted.map((file) => {
            const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
            const header = tree && dir !== lastDir ? <li key={`dir:${dir}`} className="ide-scm-dir">{dir || '.'}</li> : null
            lastDir = dir
            return [header, <FileRow key={file.path} file={file} code={action === 'stage' ? file.work : file.index} action={action} onAction={onAction} cwd={cwd} />]
          })}
        </ul>
      )}
    </section>
  )
}

/** Sag panel "Source Control" (PRD 4.9, F2.3). Diff goruntuleyici Faz 4; dosyaya tiklamak VS Code'da acar. */
export function SourceControlPanel(): React.JSX.Element {
  const cwd = useWorkspaceCwd()
  const [state, setState] = useState<ScmState | null | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [tree, setTree] = useState(false)
  const [commitsOpen, setCommitsOpen] = useState(true)
  const [menu, setMenu] = useState<MenuAnchor | null>(null)

  const refresh = useCallback((): void => {
    if (!cwd) { setState(null); return }
    void window.termflow.git.scm(cwd).then(setState).catch(() => setState(null))
  }, [cwd])

  useEffect(() => {
    setState(undefined)
    refresh()
    // Ajanlar dosya degistirirken panel canli kalsin; yalniz panel acikken.
    const timer = window.setInterval(refresh, 4000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refresh])

  const act = async (action: ScmAction, label = action.kind): Promise<boolean> => {
    setBusy(label)
    const result = await window.termflow.git.scmRun(cwd, action).catch(() => ({ ok: false as const, error: 'Git command failed.' }))
    setBusy('')
    if (!result.ok) fail(result.error)
    refresh()
    return result.ok
  }

  const commit = async (): Promise<void> => {
    if (await act({ kind: 'commit', message })) setMessage('')
  }

  if (state === undefined) return <div className="ide-agents"><div className="ide-note"><LoaderCircle size={14} className="spin" /> Reading repository...</div></div>
  if (!state) return <div className="ide-agents"><div className="ide-note">The active workspace is not a git repository.</div></div>

  const stagedFiles = state.files.filter(staged)
  const changes = state.files.filter(unstaged)
  const canCommit = Boolean(message.trim()) && stagedFiles.length > 0 && !busy
  return (
    <div className="ide-agents ide-scm">
      <div className="ide-panel-head">
        <div>
          <strong>Source Control</strong>
          <span className="ide-scm-branch" title={state.upstream ? `${state.branch} -> ${state.upstream}` : state.branch}>
            {state.branch}{state.upstream && <> {'->'} {state.upstream}</>}
            {state.behind > 0 && <> <ArrowDown size={11} />{state.behind}</>}
            {state.ahead > 0 && <> <ArrowUp size={11} />{state.ahead}</>}
          </span>
        </div>
        <button className="ide-icon-btn" onClick={() => useIdePageStore.getState().open('review', { cwd })} title="Review changes (diff, comments)" aria-label="Review changes"><FileDiff size={14} /></button>
        <button className="ide-icon-btn" onClick={() => void act({ kind: 'create-pr' })} disabled={Boolean(busy)} title="Create pull request (gh)" aria-label="Create PR"><GitPullRequest size={14} /></button>
        <button className="ide-icon-btn" onClick={(e) => setMenu(menu ? null : anchorOf(e.currentTarget))} title="More actions" aria-label="Source control actions" aria-haspopup="menu"><MoreHorizontal size={14} /></button>
      </div>
      {menu && (
        <IdeMenu anchor={menu} label="Source control actions" onClose={() => setMenu(null)}>
          <MenuItem checked={tree} onSelect={() => { setMenu(null); setTree(!tree) }}>View as Tree</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); refresh() }}>Refresh</MenuItem>
        </IdeMenu>
      )}
      <textarea
        className="ide-scm-message"
        placeholder={`Message (Ctrl+Enter to commit on "${state.branch}")`}
        value={message}
        rows={2}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && canCommit) { e.preventDefault(); void commit() } }}
        aria-label="Commit message"
      />
      <div className="ide-scm-actions">
        <button className="settings-btn settings-btn-primary" disabled={!canCommit} onClick={() => void commit()} title={stagedFiles.length === 0 ? 'Stage changes first' : 'Commit staged changes'}>
          {busy === 'commit' ? <LoaderCircle size={13} className="spin" /> : null} Commit
        </button>
        {(!state.upstream || state.ahead > 0) && state.branch !== 'HEAD' && (
          <button className="settings-btn" disabled={Boolean(busy)} onClick={() => void act({ kind: 'push' })}>
            {busy === 'push' ? <LoaderCircle size={13} className="spin" /> : <CloudUpload size={13} />} {state.upstream ? `Push ${state.ahead}` : 'Publish Branch'}
          </button>
        )}
      </div>
      <div className="ide-scm-lists">
        {state.files.length === 0 && <div className="ide-note">No changes in the working tree.</div>}
        <FileGroup title="Staged Changes" files={stagedFiles} action="unstage" tree={tree} onAction={(a) => void act(a)} cwd={cwd} />
        <FileGroup title="Changes" files={changes} action="stage" tree={tree} onAction={(a) => void act(a)} cwd={cwd} />
      </div>
      <section className="ide-scm-group ide-scm-commits">
        <div className="ide-scm-group-head">
          <button onClick={() => setCommitsOpen(!commitsOpen)} aria-expanded={commitsOpen}>{commitsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}COMMITS</button>
        </div>
        {commitsOpen && (
          <ul>
            {state.commits.length === 0 && <li className="ide-note">No commits yet.</li>}
            {state.commits.map((c) => (
              <li key={c.hash} className="ide-scm-commit" title={`${c.hash} by ${c.author}, ${c.when}`}>
                <span>{c.subject}</span><small>{c.when}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const CHECK_ICON: Record<string, React.JSX.Element> = {
  SUCCESS: <CircleCheck size={14} className="ide-check-ok" />,
  FAILURE: <CircleX size={14} className="ide-check-fail" />,
  ERROR: <CircleX size={14} className="ide-check-fail" />,
  CANCELLED: <CircleX size={14} className="ide-check-fail" />
}

/** Sag panel "Checks" (PRD 4.9, F2.4): aktif dalin PR check'leri; PR yoksa Publish Branch. */
export function ChecksPanel(): React.JSX.Element {
  const cwd = useWorkspaceCwd()
  const [checks, setChecks] = useState<ScmChecks | null>(null)
  const [upstream, setUpstream] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback((): void => {
    setChecks(null)
    if (!cwd) { setChecks({ pr: false, checks: [] }); return }
    void window.termflow.git.checks(cwd).then(setChecks)
    void window.termflow.git.scm(cwd).then((s) => setUpstream(s ? s.upstream : null))
  }, [cwd])
  useEffect(refresh, [refresh])

  const publish = async (): Promise<void> => {
    setBusy(true)
    const result = await window.termflow.git.scmRun(cwd, { kind: 'push' })
    setBusy(false)
    if (!result.ok) fail(result.error)
    refresh()
  }

  return (
    <div className="ide-agents">
      <div className="ide-panel-head">
        <div><strong>Checks</strong><span>Pull request checks for the active branch</span></div>
        <button className="ide-icon-btn" onClick={refresh} title="Refresh" aria-label="Refresh checks"><RefreshCw size={14} /></button>
      </div>
      {!checks && <div className="ide-note"><LoaderCircle size={14} className="spin" /> Loading checks...</div>}
      {checks?.error && <div className="ide-note ide-note-error">{checks.error}</div>}
      {checks && !checks.error && !checks.pr && (
        <div className="ide-scm-empty">
          <p>{upstream === '' ? 'This branch has no upstream yet. Publish it, then open a pull request to see its checks.' : 'No pull request for this branch yet.'}</p>
          {upstream === '' && <button className="settings-btn" disabled={busy} onClick={() => void publish()}>{busy ? <LoaderCircle size={13} className="spin" /> : <CloudUpload size={13} />} Publish Branch</button>}
        </div>
      )}
      {checks?.pr && checks.checks.length === 0 && <div className="ide-note">No checks reported on this pull request.</div>}
      {checks?.pr && checks.checks.length > 0 && (
        <ul className="ide-session-list">
          {checks.checks.map((check) => (
            <li key={`${check.workflow}/${check.name}`}>
              <button className="ide-check-row" onClick={() => check.link && void window.termflow.system.openExternal(check.link)} title={check.link || check.state}>
                {CHECK_ICON[check.state] ?? <CircleDashed size={14} className="ide-check-wait" />}
                <span>{check.workflow ? `${check.workflow} / ${check.name}` : check.name}</span>
                <small>{check.state.toLowerCase()}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
