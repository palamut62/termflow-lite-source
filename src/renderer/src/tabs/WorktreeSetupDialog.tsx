import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { GitBranch, Loader2 } from 'lucide-react'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useWorktreeSetupStore, type PendingSetup } from '../store/worktreeSetupStore'

/** Yeni worktree'de ajan baslamadan once kurulum adimlari (docs/orca-parity/worktree-setup.md). */
export function WorktreeSetupDialog(): React.JSX.Element | null {
  const pending = useWorktreeSetupStore((s) => s.pending)
  return pending ? <SetupRun key={pending.worktree.path} pending={pending} /> : null
}

function SetupRun({ pending }: { pending: PendingSetup }): React.JSX.Element {
  const { worktree, steps, profileId, permissionMode } = pending
  const [runId] = useState(() => nanoid(8))
  const [output, setOutput] = useState('')
  const [failure, setFailure] = useState<{ step: number; error: string } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const started = useRef(false)
  const outputRef = useRef<HTMLPreElement>(null)

  const finish = (open: 'agent' | 'shell' | 'cancel'): void => {
    useWorktreeSetupStore.getState().clear()
    const store = useTerminalStore.getState()
    if (open === 'agent') {
      store.addTab(profileId, true, undefined, undefined, permissionMode, worktree)
    } else if (open === 'shell') {
      const { settings, shells } = useSettingsStore.getState()
      const shell = shells.find((s) => s.id === settings.defaultProfileId)?.id ?? shells[0]?.id ?? resolveDefaultProfileId(settings, shells)
      store.addTab(shell, true, undefined, undefined, undefined, worktree)
    } else {
      // Mevcut akis: bos kalan checkout'u kaldirmayi teklif et.
      useTerminalStore.setState({ pendingWorktreeCleanup: worktree })
    }
  }

  useEffect(() => window.termflow.worktree.onSetupOutput((id, text) => {
    if (id === runId) setOutput((value) => (value + text).slice(-20_000))
  }), [runId])

  // StrictMode efekti iki kez calistirir; kurulum bir kez baslamali.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void window.termflow.worktree.runSetup({ runId, repoRoot: worktree.repoRoot, worktreePath: worktree.path, steps }).then((result) => {
      if (result.ok) finish('agent')
      else setFailure(result)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  const failedAt = failure && (failure.step === 0 ? 'Copying files failed.' : `Setup failed at step ${failure.step}: ${steps.commands[failure.step - 1]}`)

  return createPortal(
    <div className="settings-backdrop path-launch-backdrop">
      <div className="path-launch-panel" role="dialog" aria-modal="true" aria-label="Worktree setup">
        <header className="settings-header">
          <span className="settings-header-title"><GitBranch size={16} /> Setting up {worktree.branch || 'worktree'}</span>
        </header>
        <div className="path-launch-content">
          <p className="path-launch-hint" title={worktree.path}>{worktree.path}</p>
          <pre ref={outputRef} className="worktree-setup-output" aria-label="Setup output" aria-live="polite">{output || 'Starting...'}</pre>
          {failure && <p className="path-launch-error" role="alert">{failedAt} {failure.error}</p>}
        </div>
        <div className="path-launch-actions">
          {failure ? (
            <>
              <button className="settings-btn" onClick={() => finish('cancel')}>Cancel</button>
              <button className="settings-btn" onClick={() => finish('shell')}>Open shell here</button>
              <button className="settings-btn settings-btn-primary" onClick={() => finish('agent')} autoFocus>Start agent anyway</button>
            </>
          ) : (
            <>
              <span className="worktree-setup-status"><Loader2 size={13} className="spin" /> Running setup steps...</span>
              <button className="settings-btn" disabled={cancelling} onClick={() => { setCancelling(true); window.termflow.worktree.cancelSetup(runId) }}>
                {cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
