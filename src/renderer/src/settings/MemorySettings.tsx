import { useCallback, useEffect, useState } from 'react'
import { Brain, RefreshCw, Trash2 } from 'lucide-react'
import type { MemoryAgent, MemoryConnection, MemoryProject, MemoryStatus } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { Field, TextInput, Toggle } from './Settings'

const SECRET_ID = 'termflow-memory'
const MODEL_SUGGESTIONS = ['deepseek/deepseek-v4-flash', 'google/gemini-3.5-flash-lite', 'openai/gpt-6-luna', 'anthropic/claude-haiku-4.5']
const AGENT_LABEL: Record<MemoryAgent, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' }
const CONNECTION_LABEL: Record<MemoryConnection['state'], string> = {
  missing: 'CLI not installed',
  disconnected: 'Not connected',
  connected: 'Connected',
  outdated: 'Registered with an old app path',
  error: 'Error'
}

const date = (time?: number): string => time ? new Date(time).toLocaleString() : 'never'

function statusText(status: MemoryStatus | null): string {
  if (!status) return 'Loading...'
  switch (status.state) {
    case 'disabled': return 'Off'
    case 'no-key': return 'Waiting for an OpenRouter API key'
    case 'running': return status.total ? `Summarizing sessions ${status.done ?? 0}/${status.total}` : 'Scanning sessions...'
    case 'error': return `Stopped: ${status.lastError ?? 'unknown error'}`
    default: return `Up to date · last run ${date(status.lastRunAt)}`
  }
}

export function MemorySettings(): React.JSX.Element {
  const memory = useSettingsStore((s) => s.settings.memory)
  const update = useSettingsStore((s) => s.update)
  const toast = useToastStore((s) => s.show)
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [projects, setProjects] = useState<MemoryProject[]>([])
  const [connections, setConnections] = useState<MemoryConnection[]>([])
  const [busyAgent, setBusyAgent] = useState<MemoryAgent | null>(null)
  const [preview, setPreview] = useState<{ key: string; text: string } | null>(null)
  const [consent, setConsent] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [model, setModel] = useState(memory.model)

  const refresh = useCallback(async (): Promise<void> => {
    const [nextStatus, nextProjects, keyStored] = await Promise.all([
      window.termflow.memory.status(),
      window.termflow.memory.projects(),
      window.termflow.providerSecrets.has(SECRET_ID)
    ])
    setStatus(nextStatus)
    setProjects(nextProjects)
    setHasKey(keyStored)
  }, [])

  useEffect(() => {
    void refresh()
    void window.termflow.memory.connections().then(setConnections)
    return window.termflow.memory.onStatus((next) => {
      setStatus(next)
      if (next.state !== 'running') void window.termflow.memory.projects().then(setProjects)
    })
  }, [refresh])

  useEffect(() => setModel(memory.model), [memory.model])

  const setEnabled = async (enabled: boolean): Promise<void> => {
    setConsent(false)
    await update({ memory: { ...memory, enabled } })
    await refresh()
  }

  const saveKey = async (): Promise<void> => {
    // Kopyalanan anahtarlar bazen tırnaklı gelir ("sk-or-...").
    const key = apiKey.trim().replace(/^["']|["']$/g, '')
    if (!key) return
    try {
      await window.termflow.providerSecrets.set(SECRET_ID, key)
      setApiKey('')
      toast('OpenRouter key stored securely', 'success')
      await refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The key could not be stored', 'error')
    }
  }

  const removeKey = async (): Promise<void> => {
    await window.termflow.providerSecrets.delete(SECRET_ID)
    await refresh()
  }

  const saveModel = async (): Promise<void> => {
    const next = model.trim()
    if (next && next !== memory.model) await update({ memory: { ...memory, model: next } })
  }

  const runNow = async (): Promise<void> => {
    const result = await window.termflow.memory.run()
    setStatus(result)
    setProjects(await window.termflow.memory.projects())
    if (result.state === 'error') toast(result.lastError ?? 'Memory update failed', 'error')
    else if (result.lastError) toast(result.lastError, 'info')
    else toast('Memory updated', 'success')
  }

  const toggleConnection = async (connection: MemoryConnection): Promise<void> => {
    setBusyAgent(connection.agent)
    try {
      const result = connection.state === 'connected'
        ? await window.termflow.memory.disconnect(connection.agent)
        : await window.termflow.memory.connect(connection.agent)
      if (result) {
        setConnections((list) => list.map((item) => item.agent === result.agent ? result : item))
        if (result.state === 'error') toast(`${AGENT_LABEL[result.agent]}: ${result.detail ?? 'failed'}`, 'error')
      }
    } finally {
      setBusyAgent(null)
    }
  }

  const exclude = async (project: MemoryProject): Promise<void> => {
    await update({ memory: { ...memory, excludedProjects: [...new Set([...memory.excludedProjects, project.key])] } })
    await window.termflow.memory.forget(project.key)
    if (preview?.key === project.key) setPreview(null)
    await refresh()
    toast('Project excluded and its memory deleted', 'info')
  }

  const include = async (key: string): Promise<void> => {
    await update({ memory: { ...memory, excludedProjects: memory.excludedProjects.filter((item) => item !== key) } })
  }

  const showPreview = async (project: MemoryProject): Promise<void> => {
    if (preview?.key === project.key) return setPreview(null)
    const text = await window.termflow.memory.project(project.key)
    setPreview({ key: project.key, text: text?.replace(/^---[\s\S]*?---\s*/, '') ?? 'Memory file is missing.' })
  }

  const clearAll = async (): Promise<void> => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    setConfirmClear(false)
    setPreview(null)
    await window.termflow.memory.clear()
    await refresh()
    toast('All memory deleted', 'info')
  }

  const running = status?.state === 'running'

  return (
    <section>
      <div className="settings-section-title"><Brain size={14} /> Agent Memory</div>
      <p className="settings-note">
        Builds a memory of the last 30 days from your own Claude Code, Codex and OpenCode sessions on this computer:
        per project, what was done, what is unfinished and which problems are open. Connected agents read it at the start
        of a session. Memory stays in this computer's app data folder and is never shared; older entries are deleted automatically.
      </p>

      <Field label="Enable memory" hint="Uses your OpenRouter key and model">
        <Toggle checked={memory.enabled} label="Enable agent memory" onChange={(on) => on ? setConsent(true) : void setEnabled(false)} />
      </Field>
      {consent && (
        <div className="memory-consent" role="alertdialog" aria-label="Enable agent memory">
          <strong>What is sent to OpenRouter</strong>
          <span>
            A short digest per session: your requests, the agent's final answers, task lists, changed file names, commit
            messages and failed check names. File contents and command output are never sent; API keys are masked.
            The chosen model's provider processes the text under OpenRouter's terms. You can exclude any project below.
          </span>
          <div className="profile-form-actions">
            <button className="settings-btn settings-btn-primary" onClick={() => void setEnabled(true)}>Enable</button>
            <button className="settings-btn" onClick={() => setConsent(false)}>Cancel</button>
          </div>
        </div>
      )}

      <Field label="OpenRouter API key" hint={hasKey ? 'Stored securely. Paste a new key to replace it.' : 'Encrypted by the operating system; never written to settings.json'}>
        <span className="memory-inline">
          <TextInput className="settings-input-wide" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasKey ? 'Stored securely' : 'sk-or-...'} />
          <button className="settings-btn settings-btn-small" disabled={!apiKey.trim()} onClick={() => void saveKey()}>Save</button>
          {hasKey && <button className="settings-btn settings-btn-small settings-btn-danger" onClick={() => void removeKey()} aria-label="Remove OpenRouter key"><Trash2 size={12} /></button>}
        </span>
      </Field>

      <Field label="Model" hint="Any OpenRouter model id; cheap long-context models work well">
        <TextInput className="settings-input-wide" list="memory-models" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => void saveModel()} onKeyDown={(e) => { if (e.key === 'Enter') void saveModel() }} />
        <datalist id="memory-models">{MODEL_SUGGESTIONS.map((id) => <option key={id} value={id} />)}</datalist>
      </Field>

      <Field label="Status" hint={status?.usage?.requests ? `Last run: ${status.usage.requests} requests, ${status.usage.promptTokens + status.usage.completionTokens} tokens${status.usage.cost ? `, $${status.usage.cost.toFixed(4)}` : ''}` : 'Checks for changed sessions every 30 minutes'}>
        <span className="memory-inline">
          <span className={`memory-status${status?.state === 'error' ? ' memory-status-error' : ''}`}>{statusText(status)}</span>
          <button className="settings-btn settings-btn-small" disabled={running || !memory.enabled || !hasKey} onClick={() => void runNow()}>
            <RefreshCw size={12} className={running ? 'memory-spin' : undefined} /> Update now
          </button>
        </span>
      </Field>
      {status?.lastError && status.state !== 'error' && <p className="settings-note">{status.lastError}</p>}

      <div className="settings-section-title">Connect agents</div>
      <p className="settings-note">Registers the local, read-only memory server with each agent's own <code>mcp add</code> command (OpenCode: its config file, backed up first). Nothing is shared between users.</p>
      {connections.map((connection) => (
        <div className="profile-row" key={connection.agent}>
          <span className="profile-row-info">
            <span className="profile-row-name">{AGENT_LABEL[connection.agent]}</span>
            <span className="profile-row-command">{CONNECTION_LABEL[connection.state]}{connection.detail ? ` · ${connection.detail}` : ''}</span>
          </span>
          {connection.state !== 'missing' && (
            <button className="settings-btn settings-btn-small" disabled={busyAgent !== null} onClick={() => void toggleConnection(connection)}>
              {busyAgent === connection.agent ? 'Working...' : connection.state === 'connected' ? 'Disconnect' : connection.state === 'outdated' ? 'Repair' : 'Connect'}
            </button>
          )}
        </div>
      ))}

      <div className="settings-section-title">Projects ({projects.length})</div>
      {!projects.length && <p className="settings-note">No project memory yet.</p>}
      {projects.map((project) => (
        <div key={project.key}>
          <div className="profile-row">
            <span className="profile-row-info">
              <span className="profile-row-name" title={project.path}>{project.path}</span>
              <span className="profile-row-command">{new Date(project.lastSessionAt).toLocaleDateString()} · {project.sessions} sessions{project.status ? ` · ${project.status}` : ''}</span>
            </span>
            <button className="settings-btn settings-btn-small" onClick={() => void showPreview(project)}>{preview?.key === project.key ? 'Hide' : 'View'}</button>
            <button className="settings-btn settings-btn-small" onClick={() => void exclude(project)}>Exclude</button>
          </div>
          {preview?.key === project.key && <pre className="memory-preview">{preview.text}</pre>}
        </div>
      ))}

      {memory.excludedProjects.length > 0 && (
        <>
          <div className="settings-section-title">Excluded projects</div>
          {memory.excludedProjects.map((key) => (
            <div className="profile-row" key={key}>
              <span className="profile-row-info"><span className="profile-row-command">{key}</span></span>
              <button className="settings-btn settings-btn-small" onClick={() => void include(key)}>Include again</button>
            </div>
          ))}
        </>
      )}

      <div className="profile-form-actions">
        <button className="settings-btn settings-btn-danger" onClick={() => void clearAll()} onBlur={() => setConfirmClear(false)}>
          <Trash2 size={12} /> {confirmClear ? 'Click again to delete all memory' : 'Delete all memory'}
        </button>
      </div>
    </section>
  )
}
