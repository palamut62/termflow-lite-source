import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, Network, RefreshCw } from 'lucide-react'
import type { MemoryAgent, MemoryConnection, OpenRouterModelList, OrchestrationStatus, OrchestrationTarget, OrchestrationTestResult } from '../../../shared/types'
import { contextText, isFree, ModelPicker, priceText, usd } from './ModelPicker'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { Field, Select, TextInput, Toggle } from './Settings'

const AGENT_LABEL: Record<MemoryAgent, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' }
const CONNECTION_LABEL: Record<MemoryConnection['state'], string> = {
  missing: 'CLI not installed',
  disconnected: 'Not connected',
  connected: 'Connected',
  outdated: 'Registered with an old app path',
  error: 'Error'
}
const CONCURRENCY = ['1', '2', '3', '4'].map((value) => ({ value, label: value }))
const TIMEOUTS = [5, 10, 20, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes` }))
const THRESHOLDS = [{ value: '0', label: 'Off' }, ...[50, 60, 70, 80, 90].map((p) => ({ value: String(p), label: `${p}%` }))]

function testText(result: OrchestrationTestResult): string {
  const seconds = `${(result.latencyMs / 1000).toFixed(1)} s`
  if (!result.ok) return `${result.error ?? 'Test failed'} · ${seconds}`
  return `Works · wrote the test file in a worktree · ${seconds}${result.cost !== undefined ? ` · ${result.cost === 0 ? 'free' : usd(result.cost)}` : ''}`
}

function targetState(target: OrchestrationTarget): string {
  if (!target.installed) return 'CLI not installed'
  if (target.hasCredential === false) return 'No API key stored (Settings > Providers)'
  return target.providerId ? 'Claude Code with this provider profile' : 'Installed'
}

/** Ajanlarin baska ajanlara is devretmesi (docs/agent-ide/orchestration.md). Yalniz Agent IDE yerlesiminde gorunur. */
export function OrchestrationSettings(): React.JSX.Element {
  const orchestration = useSettingsStore((s) => s.settings.orchestration)
  const update = useSettingsStore((s) => s.update)
  const toast = useToastStore((s) => s.show)
  const [status, setStatus] = useState<OrchestrationStatus | null>(null)
  const [connections, setConnections] = useState<MemoryConnection[]>([])
  const [busyAgent, setBusyAgent] = useState<MemoryAgent | null>(null)
  const [targets, setTargets] = useState<OrchestrationTarget[]>([])
  const [models, setModels] = useState<Record<string, OpenRouterModelList>>({})
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, OrchestrationTestResult | undefined>>({})

  const save = (patch: Partial<typeof orchestration>): Promise<void> =>
    update({ orchestration: { ...useSettingsStore.getState().settings.orchestration, ...patch } })

  const saveTarget = (id: string, patch: { enabled?: boolean; model?: string }): Promise<void> => {
    const current = useSettingsStore.getState().settings.orchestration
    const target = targets.find((item) => item.id === id)
    const previous = current.targets[id] ?? { enabled: target?.enabled ?? true, model: target?.model ?? '' }
    return save({ targets: { ...current.targets, [id]: { ...previous, ...patch } } })
  }

  const loadModels = useCallback(async (id: string, force = false): Promise<void> => {
    const list = await window.termflow.orchestration.models(id, force)
    setModels((all) => ({ ...all, [id]: list }))
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const [nextStatus, nextConnections, nextTargets] = await Promise.all([
      window.termflow.orchestration.status(),
      window.termflow.orchestration.connections(),
      window.termflow.orchestration.targets()
    ])
    setStatus(nextStatus)
    setConnections(nextConnections)
    setTargets(nextTargets)
    for (const target of nextTargets) if (target.installed) void loadModels(target.id)
  }, [loadModels])

  useEffect(() => { void refresh() }, [refresh])
  // Acma/kapama ana surecte asenkron; durum kisa sure sonra okunur.
  useEffect(() => {
    const timer = setTimeout(() => { void window.termflow.orchestration.status().then(setStatus) }, 400)
    return () => clearTimeout(timer)
  }, [orchestration.enabled])

  const toggleConnection = async (connection: MemoryConnection): Promise<void> => {
    setBusyAgent(connection.agent)
    try {
      const result = connection.state === 'connected'
        ? await window.termflow.orchestration.disconnect(connection.agent)
        : await window.termflow.orchestration.connect(connection.agent)
      if (result) {
        setConnections((list) => list.map((item) => item.agent === result.agent ? result : item))
        if (result.state === 'error') toast(`${AGENT_LABEL[result.agent]}: ${result.detail ?? 'failed'}`, 'error')
      }
    } finally {
      setBusyAgent(null)
    }
  }

  const refreshModels = async (id: string): Promise<void> => {
    setRefreshing(id)
    try {
      await loadModels(id, true)
    } finally {
      setRefreshing(null)
    }
  }

  const runTest = async (target: OrchestrationTarget): Promise<void> => {
    setTesting(target.id)
    try {
      const result = await window.termflow.orchestration.test(target.id, target.model)
      setTests((all) => ({ ...all, [target.id]: result }))
    } finally {
      setTesting(null)
    }
  }

  const statusText = !orchestration.enabled ? 'Off' : status?.running ? 'Running · agents can delegate' : status?.error ? `Stopped: ${status.error}` : 'Starting...'

  return (
    <section>
      <div className="settings-section-title"><Network size={14} /> Orchestration</div>
      <p className="settings-note">
        Lets a coding agent hand work to another agent or model, for example a free OpenCode model, and then check the
        result. Each task runs headless in its own git worktree on a <code>deleg/</code> branch, starting from the last
        commit; nothing touches your checkout until the coordinating agent applies the commit. Inside that throwaway
        worktree the worker runs with full permissions.
      </p>

      <Field label="Enable orchestration" hint="Starts a local API on 127.0.0.1 for the termflow-agents MCP server">
        <Toggle checked={orchestration.enabled} label="Enable orchestration" onChange={(enabled) => void save({ enabled })} />
      </Field>
      <Field label="Status">
        <span className={`memory-status${status?.error ? ' memory-status-error' : ''}`}>{statusText}</span>
      </Field>
      <Field label="Tasks at the same time" hint="OpenCode tasks always run one after another">
        <Select value={String(orchestration.maxConcurrent)} options={CONCURRENCY} onChange={(value) => void save({ maxConcurrent: Number(value) })} />
      </Field>
      <Field label="Time limit per task" hint="The whole process tree is stopped when it runs out">
        <Select value={String(orchestration.timeoutMinutes)} options={TIMEOUTS} onChange={(value) => void save({ timeoutMinutes: Number(value) })} />
      </Field>
      <Field label="Suggest free agents above" hint="When Claude's 5-hour usage passes this, list_agents tells the agent to delegate to free models">
        <Select value={String(orchestration.claudeThreshold)} options={THRESHOLDS} onChange={(value) => void save({ claudeThreshold: Number(value) })} />
      </Field>

      <div className="settings-section-title">Connect coordinating agents</div>
      <p className="settings-note">Registers the termflow-agents MCP server with each agent's own <code>mcp add</code> command (OpenCode: its config file, backed up first). The agent can then call list_agents, delegate_task and get_task_result.</p>
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

      <div className="settings-section-title">Agents that can take work</div>
      {targets.map((target) => {
        const list = models[target.id]
        const selected = list?.models.find((item) => item.id === target.model)
        const test = tests[target.id]
        const usable = target.installed && target.hasCredential !== false
        return (
          <div key={target.id} className="orchestration-target">
            <div className={`profile-row${usable ? '' : ' profile-row-missing'}`}>
              <span className="profile-row-info">
                <span className="profile-row-name">{target.label}</span>
                <span className="profile-row-command">{target.id} · {targetState(target)}</span>
              </span>
              <Toggle checked={target.enabled} label={`Let agents delegate to ${target.label}`} disabled={!usable} onChange={(enabled) => {
                setTargets((all) => all.map((item) => item.id === target.id ? { ...item, enabled } : item))
                void saveTarget(target.id, { enabled })
              }} />
            </div>
            {usable && (
              <div className="memory-inline orchestration-model">
                {list && list.models.length > 0
                  ? <ModelPicker showStructured={false} models={list.models} value={target.model} onChange={(model) => {
                    setTargets((all) => all.map((item) => item.id === target.id ? { ...item, model } : item))
                    setTests((all) => ({ ...all, [target.id]: undefined }))
                    void saveTarget(target.id, { model })
                  }} />
                  : <TextInput className="settings-input-wide" value={target.model} placeholder="CLI default model" aria-label={`${target.label} model`} onChange={(e) => {
                    const model = e.target.value
                    setTargets((all) => all.map((item) => item.id === target.id ? { ...item, model } : item))
                    void saveTarget(target.id, { model: model.trim() })
                  }} />}
                {list && list.source !== 'none' && (
                  <button className="settings-btn settings-btn-small" disabled={refreshing === target.id} onClick={() => void refreshModels(target.id)} aria-label={`Refresh ${target.label} models`} title="Ask the CLI for its model list again">
                    <RefreshCw size={12} className={refreshing === target.id ? 'memory-spin' : undefined} />
                  </button>
                )}
                <button className="settings-btn settings-btn-small" disabled={testing !== null || !target.enabled} onClick={() => void runTest(target)} title="Run a tiny real task in a temporary repository">
                  <FlaskConical size={12} className={testing === target.id ? 'memory-spin' : undefined} /> {testing === target.id ? 'Testing...' : 'Test'}
                </button>
              </div>
            )}
            {usable && (selected || list?.error || test) && (
              <p className="settings-note memory-model-info">
                {selected && <>{selected.name} · {selected.contextLength ? `${contextText(selected.contextLength)} · ` : ''}{selected.inputPrice !== null ? priceText(selected) : 'price unknown'}{isFree(selected) && ' · no cost'}</>}
                {selected && !selected.structured && <> · <span className="memory-status-error">no tool calling, it cannot edit files</span></>}
                {list?.error && <>{selected ? <br /> : null}<span className="memory-status-error">Model list: {list.error}</span></>}
                {test && <><br /><span className={test.ok ? 'memory-status' : 'memory-status memory-status-error'}>Test: {testText(test)}</span></>}
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}
