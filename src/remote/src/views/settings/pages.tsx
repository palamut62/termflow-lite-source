import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ChevronRight, CircleAlert, FlaskConical, RefreshCw } from 'lucide-react'
import type { MemoryAgent, MemoryConnection, MemoryProject, MemoryStatus, OpenRouterModelList, OpenRouterModelTest, UpdateStatus } from '../../../../shared/types'
import { client, errorText, useRemote } from '../../store'
import { launchOptions } from '../../profiles'
import { Confirm, Empty, Group, Row, Select, Sheet, Toggle, timeAgo } from '../../ui'

// ---------------- Shells & default profile ----------------

type Health = { label: string; ok: boolean; detail: string }[]

export function ShellsPage(): React.JSX.Element {
  const settings = useRemote((s) => s.settings)
  const shells = useRemote((s) => s.shells)
  const update = useRemote((s) => s.updateSettings)
  const toast = useRemote((s) => s.toast)
  const [health, setHealth] = useState<{ name: string; checks: Health } | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  if (!settings) return <></>
  const options = launchOptions(settings, shells)

  const check = async (id: string, name: string): Promise<void> => {
    setChecking(id)
    try {
      setHealth({ name, checks: await client().ipc<Health>('profile:health', id, id.startsWith('ssh:')) })
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setChecking(null)
    }
  }

  return (
    <>
      <Group title="Default for new tabs">
        <Row label="Default profile">
          <Select label="Default profile" value={settings.defaultProfileId} options={options.map((o) => ({ value: o.id, label: `${o.name} (${o.group})` }))} onChange={(defaultProfileId) => void update({ defaultProfileId })} />
        </Row>
      </Group>
      <Group title="Shells found on the computer">
        {shells.length === 0 && <Row label="No shells found" />}
        {shells.map((shell) => (
          <Row key={shell.id} label={shell.name} hint={shell.command} onClick={() => void check(shell.id, shell.name)}>
            {checking === shell.id ? <RefreshCw size={16} className="spin" /> : <span className="link">Check</span>}
          </Row>
        ))}
      </Group>
      <Group title="Check a profile">
        {options.filter((o) => o.group !== 'Shells').map((o) => (
          <Row key={o.id} label={o.name} hint={o.group} onClick={() => void check(o.id, o.name)}>
            {checking === o.id ? <RefreshCw size={16} className="spin" /> : <span className="link">Check</span>}
          </Row>
        ))}
      </Group>
      {health && (
        <Sheet title={`Health: ${health.name}`} onClose={() => setHealth(null)}>
          <Group>
            {health.checks.map((c, i) => (
              <Row key={i} label={<>{c.ok ? <CheckCircle2 size={16} className="ok" /> : <CircleAlert size={16} className="bad" />} {c.label}</>} hint={c.detail} />
            ))}
          </Group>
        </Sheet>
      )}
    </>
  )
}

// ---------------- Agent Memory ----------------

const MEMORY_SECRET_ID = 'termflow-memory'
const AGENTS: { id: MemoryAgent; name: string }[] = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'opencode', name: 'OpenCode' }
]
const CONNECTION_LABEL: Record<MemoryConnection['state'], string> = {
  missing: 'CLI not installed',
  disconnected: 'Not connected',
  connected: 'Connected',
  outdated: 'Registered with an old app path',
  error: 'Error'
}

function memoryStatusText(status: MemoryStatus | null): string {
  if (!status) return 'Loading...'
  switch (status.state) {
    case 'disabled': return 'Off'
    case 'no-key': return 'Waiting for an OpenRouter API key'
    case 'running': return status.total ? `Summarizing sessions ${status.done ?? 0}/${status.total}` : 'Scanning sessions...'
    case 'error': return `Stopped: ${status.lastError ?? 'unknown error'}`
    default: return `Up to date${status.lastRunAt ? ` · ${timeAgo(status.lastRunAt)}` : ''}`
  }
}

export function MemoryPage(): React.JSX.Element {
  const settings = useRemote((s) => s.settings)
  const update = useRemote((s) => s.updateSettings)
  const toast = useRemote((s) => s.toast)
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [projects, setProjects] = useState<MemoryProject[]>([])
  const [connections, setConnections] = useState<MemoryConnection[]>([])
  const [hasKey, setHasKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [consent, setConsent] = useState(false)
  const [catalog, setCatalog] = useState<OpenRouterModelList | null>(null)
  const [modelFilter, setModelFilter] = useState('')
  const [pickModel, setPickModel] = useState(false)
  const [test, setTest] = useState<OpenRouterModelTest | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ project: MemoryProject; text: string } | null>(null)
  const [forget, setForget] = useState<MemoryProject | null>(null)
  const memory = settings?.memory

  const refresh = useCallback(async (): Promise<void> => {
    const c = client()
    const [s, p, k, conns] = await Promise.all([
      c.ipc<MemoryStatus>('memory:status'),
      c.ipc<MemoryProject[]>('memory:projects'),
      c.ipc<boolean>('provider-secret:status', MEMORY_SECRET_ID),
      c.ipc<MemoryConnection[]>('memory:connections')
    ])
    setStatus(s)
    setProjects(p)
    setHasKey(k)
    setConnections(conns)
  }, [])

  useEffect(() => {
    void refresh().catch((error) => toast(errorText(error), 'error'))
  }, [refresh, toast])

  if (!memory) return <></>

  const act = async (label: string, work: () => Promise<void>): Promise<void> => {
    setBusy(label)
    try {
      await work()
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const setEnabled = (enabled: boolean): Promise<void> => act('enable', async () => {
    setConsent(false)
    await update({ memory: { ...memory, enabled } })
    await refresh()
  })

  const saveKey = (): Promise<void> => act('key', async () => {
    await client().ipc('provider-secret:set', MEMORY_SECRET_ID, apiKey)
    setApiKey('')
    setHasKey(true)
    toast('OpenRouter key stored on the computer.')
  })

  const loadModels = (force: boolean): Promise<void> => act('models', async () => {
    const list = await client().ipc<OpenRouterModelList>('memory:models', force)
    setCatalog(list)
    if (list.error) toast(list.error, 'error')
  })

  const chooseModel = async (model: string): Promise<void> => {
    setPickModel(false)
    setTest(null)
    await update({ memory: { ...memory, model } })
  }

  const runTest = (): Promise<void> => act('test', async () => {
    setTest(await client().ipc<OpenRouterModelTest>('memory:test-model', memory.model))
  })

  const runNow = (): Promise<void> => act('run', async () => {
    const result = await client().ipc<MemoryStatus>('memory:run')
    setStatus(result)
    setProjects(await client().ipc<MemoryProject[]>('memory:projects'))
    toast(result.state === 'error' ? result.lastError ?? 'Memory update failed' : 'Memory updated', result.state === 'error' ? 'error' : 'info')
  })

  const toggleConnection = (agent: MemoryAgent, connected: boolean): Promise<void> => act(agent, async () => {
    const next = await client().ipc<MemoryConnection | null>(connected ? 'memory:disconnect' : 'memory:connect', agent)
    if (next) setConnections((list) => list.map((c) => (c.agent === agent ? next : c)))
  })

  const toggleExcluded = (key: string): void => {
    const excluded = memory.excludedProjects.includes(key)
      ? memory.excludedProjects.filter((k) => k !== key)
      : [...memory.excludedProjects, key]
    void update({ memory: { ...memory, excludedProjects: excluded } })
  }

  const models = (catalog?.models ?? []).filter((m) => !modelFilter || m.id.toLowerCase().includes(modelFilter.toLowerCase()))
  const selected = catalog?.models.find((m) => m.id === memory.model)

  return (
    <>
      <p className="page-note">
        A 30-day memory per project, built from your Claude Code, Codex and OpenCode sessions on the computer. Connected agents read it at session start.
      </p>
      <Group>
        <Row label="Enable memory" hint={memoryStatusText(status)}>
          <Toggle label="Enable memory" checked={memory.enabled} disabled={busy === 'enable'} onChange={(on) => (on ? setConsent(true) : void setEnabled(false))} />
        </Row>
        <Row label="Update now" hint="Summarize new sessions" onClick={busy ? undefined : () => void runNow()}>
          {busy === 'run' ? <RefreshCw size={16} className="spin" /> : <ChevronRight size={16} />}
        </Row>
      </Group>

      <Group title="OpenRouter">
        <div className="row stacked">
          <span className="row-text">
            <span className="row-label">API key</span>
            <span className="row-hint">{hasKey ? 'Stored encrypted on the computer. Paste a new key to replace it.' : 'Not stored yet.'}</span>
          </span>
          <span className="inline-form">
            <input className="input mono" type="password" autoComplete="off" value={apiKey} placeholder={hasKey ? 'Stored securely' : 'sk-or-...'} onChange={(e) => setApiKey(e.target.value)} />
            <button className="btn small primary" disabled={!apiKey.trim() || busy === 'key'} onClick={() => void saveKey()}>Save</button>
          </span>
        </div>
        <Row label="Model" hint={selected ? `${selected.contextLength.toLocaleString()} context${selected.structured ? '' : ' · no structured output, summaries may fail'}` : memory.model} onClick={() => { setPickModel(true); if (!catalog) void loadModels(false) }}>
          <span className="mono small">{memory.model}</span>
        </Row>
        <Row label="Test model" hint={test ? (test.ok ? `Works · ${(test.latencyMs / 1000).toFixed(1)} s${test.cost !== undefined ? ` · $${test.cost.toFixed(6)}` : ''}` : test.error ?? 'Failed') : 'Sends one tiny request with the stored key'} onClick={hasKey && !busy ? () => void runTest() : undefined}>
          {busy === 'test' ? <RefreshCw size={16} className="spin" /> : <FlaskConical size={16} />}
        </Row>
      </Group>

      <Group title="Agent connections">
        {connections.map((c) => (
          <Row key={c.agent} label={AGENTS.find((a) => a.id === c.agent)?.name ?? c.agent} hint={c.detail ?? CONNECTION_LABEL[c.state]}>
            {c.state !== 'missing' && (
              <button className="btn small" disabled={busy === c.agent} onClick={() => void toggleConnection(c.agent, c.state === 'connected')}>
                {c.state === 'connected' ? 'Disconnect' : 'Connect'}
              </button>
            )}
          </Row>
        ))}
      </Group>

      <Group title={`Projects (${projects.length})`}>
        {projects.length === 0 && <Row label="No project memory yet" />}
        {projects.map((p) => (
          <Row key={p.key} label={p.path.split(/[\\/]/).filter(Boolean).pop() ?? p.path} hint={`${p.sessions} sessions · ${timeAgo(p.lastSessionAt)}${memory.excludedProjects.includes(p.key) ? ' · excluded' : ''}`} onClick={() => void act('preview', async () => {
            const text = await client().ipc<string | null>('memory:project', p.key)
            setPreview({ project: p, text: text ?? 'No memory written yet.' })
          })}>
            <ChevronRight size={16} />
          </Row>
        ))}
      </Group>

      {consent && (
        <Confirm
          title="Enable agent memory?"
          text="A short digest per session is sent to OpenRouter: your requests, the agent's final answers, task lists, changed file names, commit messages and failed check names. File contents and command output are never sent; API keys are masked."
          confirmLabel="Enable"
          onCancel={() => setConsent(false)}
          onConfirm={() => void setEnabled(true)}
        />
      )}
      {pickModel && (
        <Sheet title="Memory model" onClose={() => setPickModel(false)} actions={<button className="icon-btn" onClick={() => void loadModels(true)} aria-label="Refresh models"><RefreshCw size={16} className={busy === 'models' ? 'spin' : undefined} /></button>}>
          <input className="input" placeholder="Search models" value={modelFilter} autoCapitalize="off" onChange={(e) => setModelFilter(e.target.value)} />
          {catalog?.fetchedAt ? <p className="sheet-note">{catalog.models.length} models · updated {timeAgo(catalog.fetchedAt)}</p> : null}
          <div className="model-list">
            {models.slice(0, 200).map((m) => {
              const free = m.inputPrice === 0 && m.outputPrice === 0
              return (
                <button key={m.id} className={m.id === memory.model ? 'model-item on' : 'model-item'} onClick={() => void chooseModel(m.id)}>
                  <strong className={free ? 'free' : undefined}>{m.id}</strong>
                  <span>{m.contextLength.toLocaleString()} ctx · {free ? 'free' : m.inputPrice === null ? 'variable price' : `$${m.inputPrice}/$${m.outputPrice} per 1M`}{m.structured ? '' : ' · no structured output'}</span>
                </button>
              )
            })}
            {catalog && models.length === 0 && <Empty title="No model matches" />}
          </div>
        </Sheet>
      )}
      {preview && (
        <Sheet title={preview.project.path.split(/[\\/]/).filter(Boolean).pop() ?? 'Project'} onClose={() => setPreview(null)}>
          <p className="sheet-note mono">{preview.project.path}</p>
          <pre className="memory-text">{preview.text}</pre>
          <div className="form-actions">
            <button className="btn" onClick={() => toggleExcluded(preview.project.key)}>{memory.excludedProjects.includes(preview.project.key) ? 'Include again' : 'Exclude project'}</button>
            <button className="btn danger" onClick={() => setForget(preview.project)}>Forget</button>
          </div>
        </Sheet>
      )}
      {forget && (
        <Confirm
          title="Forget this project?"
          text="Its memory and summaries are deleted from the computer."
          confirmLabel="Forget"
          danger
          onCancel={() => setForget(null)}
          onConfirm={() => void act('forget', async () => {
            await client().ipc('memory:forget', forget.key)
            setForget(null)
            setPreview(null)
            setProjects(await client().ipc<MemoryProject[]>('memory:projects'))
          })}
        />
      )}
    </>
  )
}

// ---------------- Updates ----------------

export function UpdatesRow(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useRemote((s) => s.toast)
  const check = async (): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await client().ipc<UpdateStatus>('update:check'))
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }
  const hint = !status ? 'Check the computer for a newer TermFlow Lite'
    : status.state === 'available' ? `Version ${status.version} is available. Install it on the computer.`
      : status.state === 'not-available' ? 'Up to date'
        : status.state === 'error' ? status.error ?? 'Check failed'
          : status.state
  return (
    <Row label="Check for updates" hint={hint} onClick={busy ? undefined : () => void check()}>
      {busy ? <RefreshCw size={16} className="spin" /> : <ChevronRight size={16} />}
    </Row>
  )
}
