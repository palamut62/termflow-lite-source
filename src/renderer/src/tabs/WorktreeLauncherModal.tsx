import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, FolderOpen, GitBranch, Loader2, Trash2, X } from 'lucide-react'
import { availableProfiles, providerProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import type { AgentPermissionMode } from '../../../shared/types'
import type { WorktreeEntry } from '../../../shared/ipc'
import { isSafeCopyPattern, setupKey, type WorktreeSetupSteps } from '../../../shared/worktreeSetup'
import { openNewWorktree } from '../store/worktreeSetupStore'
import { Toggle } from '../settings/Settings'
import { saveWorktreeMeta } from '../shells/ide/WorktreeDetailsDialog'
import { describeTarget, parseWorktreeTarget } from './worktreeTarget'

/** Comparable path: forward slashes, case-insensitive (Windows). */
function samePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** Short, collision-resistant suffix so parallel agents never share a branch. */
function branchSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

const toLines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

/**
 * Starts an agent (or shell) in its own git worktree — an isolated checkout of
 * the same repository. Two agents can then edit the same project in parallel
 * without overwriting each other. Closing the tab offers to remove the
 * checkout again (WorktreeCleanupDialog).
 */
/** `initialBranch` / `initialRepoPath`: Agent IDE Tasks sayfasindan "Start worktree" (#PR ya da issue URL'si). */
export function WorktreeLauncherModal({ onClose, initialBranch, initialRepoPath }: { onClose: () => void; initialBranch?: string; initialRepoPath?: string }): React.JSX.Element {
  const shells = useSettingsStore((s) => s.shells)
  const settings = useSettingsStore((s) => s.settings)
  const options = useMemo(() => [
    ...availableProfiles(settings.profiles, settings.installedAgents).map((profile) => ({ id: profile.id, name: profile.name, group: 'Profiles' })),
    ...settings.providerProfiles.map((provider) => ({ id: providerProfileId(provider.id), name: provider.name, group: 'Providers' })),
    ...shells.map((shell) => ({ id: shell.id, name: shell.name, group: 'Shells' }))
  ], [settings.profiles, settings.providerProfiles, shells])

  const [profileId, setProfileId] = useState(options[0]?.id ?? settings.defaultProfileId)
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(settings.defaultAgentPermissionMode)
  const [repoPath, setRepoPath] = useState(initialRepoPath || (useTerminalStore.getState().workspaceCwd ?? ''))
  const [repo, setRepo] = useState<{ root: string; branch: string } | null>(null)
  const [repoError, setRepoError] = useState('')
  const [branch, setBranch] = useState(initialBranch || `tf/agent-${branchSuffix()}`)
  const [baseRef, setBaseRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState<WorktreeEntry[]>([])
  // Advanced (Orca): agacta parent, karta not; "Create more" modali acik tutar.
  const [allWorktrees, setAllWorktrees] = useState<WorktreeEntry[]>([])
  const [parent, setParent] = useState('')
  const [note, setNote] = useState('')
  const [sparse, setSparse] = useState('')
  const [createMore, setCreateMore] = useState(false)
  const target = parseWorktreeTarget(branch)
  const [removing, setRemoving] = useState<string | null>(null)
  // Depo basina kurulum adimlari: kayitli olan ya da (kayit yoksa) kilit dosyasina gore oneri.
  const [setupCopy, setSetupCopy] = useState('')
  const [setupCommands, setSetupCommands] = useState('')
  const [setupEnabled, setSetupEnabled] = useState(true)
  const [suggestion, setSuggestion] = useState<Pick<WorktreeSetupSteps, 'copyFiles' | 'commands'> | null>(null)
  const unsafePath = toLines(setupCopy).find((line) => !isSafeCopyPattern(line))
  const setupCount = toLines(setupCopy).length + toLines(setupCommands).length
  const tabs = useTerminalStore((s) => s.tabs)
  const openPaths = new Set(tabs.map((tab) => (tab.worktree ? samePath(tab.worktree.path) : '')).filter(Boolean))

  // Only checkouts TermFlow created (under its container dir) are offered, so
  // the user's own worktrees are never listed for removal here.
  const refreshExisting = async (root: string): Promise<void> => {
    const all = await window.termflow.worktree.list(root)
    setAllWorktrees(all.filter((entry) => !entry.bare && samePath(entry.path) !== samePath(root)))
    setExisting(all.filter((entry) => samePath(entry.path).includes('/.termflow-worktrees/')))
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); document.querySelector<HTMLButtonElement>('.worktree-create-btn')?.click() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Resolve the repository whenever the path settles, so the dialog can show
  // the real root (which may be an ancestor of what the user typed).
  useEffect(() => {
    const path = repoPath.trim()
    if (!path) { setRepo(null); setRepoError(''); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      const info = await window.termflow.worktree.repoInfo(path)
      if (cancelled) return
      setRepo(info)
      setRepoError(info ? '' : 'Not a git repository.')
      if (info && !baseRef.trim()) setBaseRef(info.branch)
      if (info) void refreshExisting(info.root)
      else setExisting([])
      const saved = info ? useSettingsStore.getState().settings.worktreeSetup[setupKey(info.root)] : undefined
      setSetupCopy(saved?.copyFiles.join('\n') ?? '')
      setSetupCommands(saved?.commands.join('\n') ?? '')
      setSetupEnabled(saved?.enabled ?? true)
      setSuggestion(null)
      if (info && !saved) {
        const suggested = await window.termflow.worktree.suggestSetup(info.root)
        if (!cancelled && (suggested.copyFiles.length > 0 || suggested.commands.length > 0)) setSuggestion(suggested)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
    // baseRef is only seeded once; re-running on its change would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath])

  const create = async (): Promise<void> => {
    if (!repo || busy || !target) return
    setBusy(true)
    setError('')
    const prBranch = target.kind === 'pr' ? `pr-${target.number}` : ''
    const result = await window.termflow.worktree.create(target.kind === 'pr'
      ? { repoRoot: repo.root, branch: prBranch, detach: true }
      : { repoRoot: repo.root, branch: target.branch, baseRef: baseRef.trim() || undefined, sparsePaths: toLines(sparse).length > 0 ? toLines(sparse) : undefined })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    // PR: detached checkout'a gh ile PR'i al (GitHubPanel ile ayni akis); basarisizsa bos worktree silinir.
    if (target.kind === 'pr') {
      const checkout = await window.termflow.github.checkoutPr(result.worktree.path, target.number, target.repo)
      if (!checkout.ok) {
        await window.termflow.worktree.remove({ repoRoot: repo.root, path: result.worktree.path, force: true })
        setError(checkout.error)
        setBusy(false)
        return
      }
    }
    if (note.trim() || parent) saveWorktreeMeta(result.worktree.path, { note: note.trim() || undefined, parent: parent || undefined })
    const steps: WorktreeSetupSteps = { copyFiles: toLines(setupCopy), commands: toLines(setupCommands), enabled: setupEnabled }
    const key = setupKey(repo.root)
    const all = useSettingsStore.getState().settings.worktreeSetup
    if (all[key] || steps.copyFiles.length > 0 || steps.commands.length > 0) {
      void useSettingsStore.getState().update({ worktreeSetup: { ...all, [key]: steps } })
    }
    if (createMore) {
      setBranch(`tf/agent-${branchSuffix()}`)
      setNote('')
      setBusy(false)
      void refreshExisting(repo.root)
    } else onClose()
    openNewWorktree({
      repoRoot: repo.root,
      path: result.worktree.path,
      branch: prBranch || (result.worktree.branch ?? (target.kind === 'branch' ? target.branch : branch.trim())),
      createdByApp: true
    }, profileId, permissionMode, steps)
  }

  const openExisting = (entry: WorktreeEntry): void => {
    if (!repo) return
    useTerminalStore.getState().addTab(profileId, true, undefined, undefined, permissionMode, {
      repoRoot: repo.root,
      path: entry.path,
      branch: entry.branch ?? '',
      createdByApp: true
    })
    onClose()
  }

  // No force: git refuses to drop a checkout with uncommitted changes, and
  // that refusal is shown instead of silently discarding work.
  const removeExisting = async (entry: WorktreeEntry): Promise<void> => {
    if (!repo || removing) return
    setRemoving(entry.path)
    setError('')
    const result = await window.termflow.worktree.remove({ repoRoot: repo.root, path: entry.path, deleteBranch: false })
    if (!result.ok) setError(result.error)
    await refreshExisting(repo.root)
    setRemoving(null)
  }

  const canCreate = !!repo && !!target && !busy && !unsafePath

  return createPortal(
    <div className="settings-backdrop path-launch-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="path-launch-panel" role="dialog" aria-modal="true" aria-label="New worktree session">
        <header className="settings-header">
          <span className="settings-header-title"><GitBranch size={16} /> New worktree session</span>
          <button className="settings-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={16} /></button>
        </header>
        <div className="path-launch-content">
          <label className="path-launch-label" htmlFor="worktree-repo"><FolderOpen size={14} /> Repository</label>
          <div className="path-launch-row">
            <input
              id="worktree-repo"
              className="settings-input"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder={'C:\\projects\\my-app'}
              autoFocus
            />
            <button className="settings-btn" onClick={async () => { const path = await window.termflow.dialog.openDir(); if (path) setRepoPath(path) }}>
              <FolderOpen size={13} /> Browse
            </button>
          </div>
          <p className="path-launch-hint">
            {repo ? `${repo.root} — on ${repo.branch}` : repoError || 'Pick a folder inside a git repository.'}
          </p>

          <label className="path-launch-label" htmlFor="worktree-branch"><GitBranch size={14} /> Name, branch, #PR or GitHub URL</label>
          <input id="worktree-branch" className="settings-input" value={branch} onChange={(event) => setBranch(event.target.value)} />
          <p className="path-launch-hint">{describeTarget(target)}</p>

          {target?.kind !== 'pr' && <>
          <label className="path-launch-label" htmlFor="worktree-base">Start from</label>
          <input id="worktree-base" className="settings-input" value={baseRef} onChange={(event) => setBaseRef(event.target.value)} placeholder="HEAD" />
          </>}

          <label className="path-launch-label" htmlFor="worktree-profile"><Bot size={14} /> Agent, provider or shell</label>
          <select id="worktree-profile" className="settings-input settings-select path-launch-select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {['Profiles', 'Providers', 'Shells'].map((group) => (
              <optgroup label={group} key={group}>
                {options.filter((option) => option.group === group).map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
              </optgroup>
            ))}
          </select>

          <label className="path-launch-label" htmlFor="worktree-permission">Agent permission mode</label>
          <select id="worktree-permission" className="settings-input settings-select path-launch-select" value={permissionMode} onChange={(event) => setPermissionMode(event.target.value as AgentPermissionMode)}>
            <option value="safe">Safe - read only</option><option value="workspace">Workspace - project writes</option><option value="full">Full Access</option>
          </select>

          {repo && (
            <details className="worktree-setup">
              <summary>Advanced</summary>
              <label className="path-launch-label" htmlFor="worktree-parent">Parent worktree (nests it in the sidebar)</label>
              <select id="worktree-parent" className="settings-input settings-select path-launch-select" value={parent} onChange={(event) => setParent(event.target.value)}>
                <option value="">{repo.branch} (primary)</option>
                {allWorktrees.map((entry) => <option key={entry.path} value={entry.path}>{entry.branch ?? entry.path}</option>)}
              </select>
              <label className="path-launch-label" htmlFor="worktree-note">Note</label>
              <textarea id="worktree-note" className="settings-input worktree-setup-text" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What is this worktree for?" rows={2} />
              <label className="path-launch-label" htmlFor="worktree-sparse">Sparse checkout (one folder per line, empty = whole repository)</label>
              <textarea id="worktree-sparse" className="settings-input worktree-setup-text" value={sparse} onChange={(event) => setSparse(event.target.value)} placeholder={'packages/web\ndocs'} rows={2} disabled={target?.kind === 'pr'} title={target?.kind === 'pr' ? 'Pull request worktrees use a full checkout' : undefined} />
            </details>
          )}

          {repo && (
            <details className="worktree-setup">
              <summary>Setup steps{setupCount > 0 ? ` (${setupCount})` : ''}</summary>
              <p className="path-launch-hint">Run in every new worktree of this repository before the agent starts. Saved when you create the worktree.</p>
              {suggestion && (
                <p className="path-launch-hint">
                  Suggested: {[...suggestion.copyFiles, ...suggestion.commands].join(', ')}{' '}
                  <button className="settings-btn" onClick={() => { setSetupCopy(suggestion.copyFiles.join('\n')); setSetupCommands(suggestion.commands.join('\n')); setSuggestion(null) }}>Use suggestion</button>
                </p>
              )}
              <label className="path-launch-label" htmlFor="worktree-setup-copy">Copy from the repository (one path or pattern per line)</label>
              <textarea id="worktree-setup-copy" className="settings-input worktree-setup-text" value={setupCopy} onChange={(event) => setSetupCopy(event.target.value)} placeholder={'.env*\nconfig/local.json'} rows={2} spellCheck={false} />
              {unsafePath && <p className="path-launch-error" role="alert">Paths must stay inside the repository: {unsafePath}</p>}
              <label className="path-launch-label" htmlFor="worktree-setup-commands">Commands (run in order, in the new worktree)</label>
              <textarea id="worktree-setup-commands" className="settings-input worktree-setup-text" value={setupCommands} onChange={(event) => setSetupCommands(event.target.value)} placeholder="npm ci" rows={2} spellCheck={false} />
              <div className="worktree-setup-toggle"><Toggle checked={setupEnabled} onChange={setSetupEnabled} label="Run these steps for new worktrees" /> Run these steps for new worktrees</div>
            </details>
          )}

          {existing.length > 0 && (
            <>
              <div className="path-launch-label">Existing worktree sessions</div>
              <ul className="github-list">
                {existing.map((entry) => {
                  const inUse = openPaths.has(samePath(entry.path))
                  return (
                    <li key={entry.path} className="github-row">
                      <span className="github-row-main" title={entry.path}>
                        <span className="worktree-row-title"><GitBranch size={13} /> {entry.branch ?? '(detached)'}{inUse ? ' — open' : ''}</span>
                      </span>
                      <button className="settings-btn" onClick={() => openExisting(entry)} disabled={busy || !!removing}>Open</button>
                      <button
                        className="settings-btn"
                        onClick={() => void removeExisting(entry)}
                        disabled={inUse || busy || !!removing}
                        title={inUse ? 'Close its tab first' : 'Remove this checkout (the branch is kept)'}
                        aria-label={`Remove worktree ${entry.branch ?? entry.path}`}
                      >
                        {removing === entry.path ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {error && <p className="path-launch-error" role="alert">{error}</p>}
        </div>
        <div className="path-launch-actions">
          <span className="worktree-create-more"><Toggle checked={createMore} onChange={setCreateMore} label="Create more" /> Create more</span>
          <button className="settings-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="settings-btn settings-btn-primary worktree-create-btn" disabled={!canCreate} onClick={create} title="Ctrl+Enter">
            {busy ? <><Loader2 size={13} className="spin" /> Creating...</> : 'Create & open'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
