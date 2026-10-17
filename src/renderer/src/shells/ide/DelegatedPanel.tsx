import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, Clock, Copy, FolderOpen, LoaderCircle, Settings, Square, Trash2 } from 'lucide-react'
import type { DelegatedTask } from '../../../../shared/types'
import { resolveDefaultProfileId, useSettingsStore } from '../../store/settingsStore'
import { useTerminalStore } from '../../store/terminalStore'
import { useToastStore } from '../../store/toastStore'
import { relativeTime } from '../../components/AgentSessions'

const ACTIVE = new Set(['queued', 'running'])

function duration(task: DelegatedTask): string {
  if (!task.startedAt) return 'waiting'
  const seconds = Math.round(((task.finishedAt ?? Date.now()) - task.startedAt) / 1000)
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function StatusIcon({ task }: { task: DelegatedTask }): React.JSX.Element {
  if (task.status === 'running') return <LoaderCircle size={13} className="ide-state-working" aria-label="Running" />
  if (task.status === 'queued') return <Clock size={13} aria-label="Queued" />
  if (task.status === 'done') return <CircleCheck size={13} className="ide-state-done" aria-label="Done" />
  return <CircleX size={13} className="ide-state-error" aria-label={task.status} />
}

/** Sag panel "Delegated": ajanlarin baska ajanlara devrettigi gorevler (docs/agent-ide/orchestration.md). */
export function DelegatedPanel(): React.JSX.Element {
  const enabled = useSettingsStore((s) => s.settings.orchestration.enabled)
  const toast = useToastStore((s) => s.show)
  const [tasks, setTasks] = useState<DelegatedTask[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [, setNow] = useState(0)

  useEffect(() => {
    void window.termflow.orchestration.tasks().then(setTasks)
    return window.termflow.orchestration.onTasks(setTasks)
  }, [])
  // Calisan gorevin suresi canli aksin.
  const running = tasks?.some((task) => task.status === 'running')
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])

  const openWorktree = (task: DelegatedTask): void => {
    if (!task.worktreePath) return
    const { settings, shells } = useSettingsStore.getState()
    useTerminalStore.getState().addTab(resolveDefaultProfileId(settings, shells), true, task.worktreePath)
  }

  const copyApply = async (task: DelegatedTask): Promise<void> => {
    if (!task.commit) return
    await window.termflow.clipboard.writeText(`git cherry-pick ${task.commit}`)
    toast('Copied: git cherry-pick command', 'info')
  }

  const discard = async (task: DelegatedTask): Promise<void> => {
    if (confirm !== task.id) {
      setConfirm(task.id)
      return
    }
    setConfirm(null)
    const result = await window.termflow.orchestration.discard(task.id)
    if (!result.ok) toast(result.error ?? 'Task could not be discarded', 'error')
  }

  return (
    <div className="ide-agents">
      <div className="ide-panel-head">
        <div><strong>Delegated</strong><span>Work agents handed to other agents</span></div>
        <button className="ide-icon-btn" onClick={() => useSettingsStore.getState().openSettings('orchestration')} title="Orchestration settings" aria-label="Orchestration settings"><Settings size={12} /></button>
      </div>
      {!enabled && (
        <div className="ide-note">
          Orchestration is off.
          <button className="ide-show-more" onClick={() => useSettingsStore.getState().openSettings('orchestration')}>Turn it on</button>
        </div>
      )}
      {tasks !== null && tasks.length === 0 && enabled && <div className="ide-note">No delegated tasks yet. Connect an agent in Settings &gt; Orchestration and ask it to delegate.</div>}
      <ul className="ide-session-list">
        {(tasks ?? []).map((task) => {
          const expanded = open === task.id
          return (
            <li key={task.id} className="delegated-task">
              <button className="ide-session-item delegated-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : task.id)} title={task.prompt}>
                <span className="ide-session-title">{task.prompt.split('\n')[0]}</span>
                <span className="ide-session-meta">
                  {task.label}{task.model ? ` · ${task.model}` : ''} · {task.status} · {duration(task)}
                  {task.cost !== undefined ? ` · ${task.cost === 0 ? 'free' : `$${task.cost.toFixed(4)}`}` : ''}
                  {task.changedFiles.length ? ` · ${task.changedFiles.length} files` : ''}
                </span>
                <StatusIcon task={task} />
              </button>
              {expanded && (
                <div className="delegated-detail">
                  <div className="ide-session-meta">
                    {task.requestedBy ? `From ${task.requestedBy} · ` : ''}{relativeTime(task.createdAt)} · {task.branch}
                  </div>
                  {task.error && <div className="ide-note ide-note-error">{task.error}</div>}
                  {task.diffStat && <pre className="delegated-pre">{task.diffStat}</pre>}
                  {task.check && <pre className="delegated-pre">{`$ ${task.checkCommand ?? ''}  (exit ${task.check.code ?? 'none'})\n${task.check.output}`}</pre>}
                  {task.lastMessage && <pre className="delegated-pre">{task.lastMessage}</pre>}
                  {task.status !== 'done' && !ACTIVE.has(task.status) && task.outputTail && <pre className="delegated-pre">{task.outputTail.slice(-1500)}</pre>}
                  <div className="delegated-actions">
                    {task.worktreePath && !ACTIVE.has(task.status) && <button className="settings-btn settings-btn-small" onClick={() => openWorktree(task)}><FolderOpen size={12} /> Open</button>}
                    {task.commit && <button className="settings-btn settings-btn-small" onClick={() => void copyApply(task)} title={`git cherry-pick ${task.commit}`}><Copy size={12} /> Copy apply command</button>}
                    {ACTIVE.has(task.status) && <button className="settings-btn settings-btn-small" onClick={() => void window.termflow.orchestration.cancel(task.id)}><Square size={12} /> Stop</button>}
                    <button className="settings-btn settings-btn-small settings-btn-danger" onClick={() => void discard(task)} onBlur={() => setConfirm(null)}>
                      <Trash2 size={12} /> {confirm === task.id ? 'Click again to delete' : 'Discard'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
