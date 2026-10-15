import { useEffect, useState } from 'react'
import { Coffee, ExternalLink, LoaderCircle, MemoryStick, Network } from 'lucide-react'
import type { ResourceSnapshot } from '../../../../shared/ipc'
import type { IdeSettings } from '../../../../shared/types'
import { agentForProfile } from '../../../../shared/profiles'
import { useSettingsStore } from '../../store/settingsStore'
import { useTerminalStore } from '../../store/terminalStore'
import { IdeMenu, MenuItem, anchorOf, type MenuAnchor } from './IdeMenu'
import { sessionState } from './ideTreeModel'
import { saveIde } from './ProjectTree'

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

const AWAKE: { id: IdeSettings['keepAwake']; label: string; hint: string }[] = [
  { id: 'on', label: 'On', hint: 'Keep this computer awake while TermFlow is open' },
  { id: 'agent', label: 'Agent', hint: 'Only while an agent is working' },
  { id: 'off', label: 'Off', hint: 'Let the computer sleep normally' }
]

/** Surec tablosu taramasi pahali: yalniz popover acikken 3 sn'de bir. */
function useResources(active: boolean): ResourceSnapshot | null {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null)
  useEffect(() => {
    if (!active) return
    let stale = false
    const load = (): void => { void window.termflow.system.resources().then((s) => { if (!stale) setSnapshot(s) }) }
    load()
    const timer = window.setInterval(load, 3000)
    return () => { stale = true; window.clearInterval(timer) }
  }, [active])
  return snapshot
}

/** Agent IDE durum cubugu sagi (Orca 4.9): Keep computer awake, Resource Manager (bellek), Ports. */
export function IdeStatusExtras(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const tabs = useTerminalStore((s) => s.tabs)
  const mode = settings.ide.keepAwake
  const [open, setOpen] = useState<{ kind: 'awake' | 'resources' | 'ports'; anchor: MenuAnchor } | null>(null)
  const [appMemory, setAppMemory] = useState(0)
  const snapshot = useResources(open?.kind === 'resources' || open?.kind === 'ports')
  const agentWorking = tabs.some((tab) => sessionState(tab, agentForProfile(settings, tab.profileId), settings.agentHooks) === 'working')
  const awake = mode === 'on' || (mode === 'agent' && agentWorking)

  useEffect(() => {
    void window.termflow.system.keepAwake(awake)
  }, [awake])
  // Terminal yerlesimine gecince (bilesen kalkar) uyku engeli birakilir.
  useEffect(() => () => { void window.termflow.system.keepAwake(false) }, [])

  useEffect(() => {
    const load = (): void => { void window.termflow.system.appMemory().then(setAppMemory) }
    load()
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const toggle = (kind: 'awake' | 'resources' | 'ports') => (e: React.MouseEvent<HTMLElement>): void => {
    const anchor = anchorOf(e.currentTarget)
    setOpen((current) => (current?.kind === kind ? null : { kind, anchor }))
  }
  const close = (): void => setOpen(null)
  const titleOf = (id?: string): string => tabs.find((t) => t.id === id)?.title ?? 'Terminal'
  const terminalMemory = snapshot?.terminals.reduce((sum, t) => sum + t.memory, 0) ?? 0
  const workspacePorts = snapshot?.ports.filter((p) => p.terminalId) ?? []
  const externalPorts = snapshot?.ports.filter((p) => !p.terminalId) ?? []

  return (
    <>
      <button className={`status-item status-action ide-awake${awake ? ' ide-awake-on' : ''}`} onClick={toggle('awake')} title="Keep computer awake" aria-label={`Keep computer awake: ${mode}`} aria-haspopup="menu">
        <Coffee size={12} />{AWAKE.find((a) => a.id === mode)?.label}
      </button>
      <button className="status-item status-action" onClick={toggle('resources')} title="Resource Manager" aria-label="Resource Manager" aria-haspopup="dialog">
        <MemoryStick size={12} />{formatBytes(appMemory)}
      </button>
      <button className="status-item status-action" onClick={toggle('ports')} title="Ports" aria-label="Ports" aria-haspopup="dialog">
        <Network size={12} />Ports
      </button>

      {open?.kind === 'awake' && (
        <IdeMenu anchor={open.anchor} up label="Keep computer awake" onClose={close} width={260}>
          <div className="ctx-menu-section" role="presentation">Keep computer awake</div>
          {AWAKE.map((a) => <MenuItem key={a.id} checked={mode === a.id} onSelect={() => { close(); saveIde({ keepAwake: a.id }) }}><span className="ide-awake-option">{a.label}<small>{a.hint}</small></span></MenuItem>)}
        </IdeMenu>
      )}
      {open?.kind === 'resources' && (
        <IdeMenu anchor={open.anchor} up label="Resource Manager" onClose={close} width={340} className="ide-resources">
          <div className="ctx-menu-section" role="presentation">Resource Manager</div>
          {!snapshot ? <div className="ide-menu-empty"><LoaderCircle size={12} className="spin" /> Reading processes...</div> : (
            <table className="ide-res-table">
              <thead><tr><th>Process</th><th>CPU</th><th>Memory</th></tr></thead>
              <tbody>
                <tr><td>TermFlow (app)</td><td>{snapshot.app.cpu}%</td><td>{formatBytes(snapshot.app.memory)}</td></tr>
                {snapshot.terminals.map((t) => (
                  <tr key={t.id}>
                    <td><button className="ide-res-link" onClick={() => { close(); useTerminalStore.getState().setActiveTab(t.id) }} title={`${t.processes} process${t.processes === 1 ? '' : 'es'}`}>{titleOf(t.id)}</button></td>
                    <td>{t.cpu}%</td><td>{formatBytes(t.memory)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td>{Math.round((snapshot.app.cpu + snapshot.terminals.reduce((s, t) => s + t.cpu, 0)) * 10) / 10}%</td><td>{formatBytes(snapshot.app.memory + terminalMemory)}</td></tr></tfoot>
            </table>
          )}
        </IdeMenu>
      )}
      {open?.kind === 'ports' && (
        <IdeMenu anchor={open.anchor} up label="Ports" onClose={close} width={300} className="ide-resources">
          <div className="ctx-menu-section" role="presentation">Workspace ports</div>
          {!snapshot && <div className="ide-menu-empty"><LoaderCircle size={12} className="spin" /> Scanning ports...</div>}
          {snapshot && workspacePorts.length === 0 && <div className="ide-menu-empty">No terminal is listening on a port.</div>}
          {workspacePorts.map((p) => (
            <MenuItem key={`${p.port}:${p.pid}`} onSelect={() => { close(); void window.termflow.system.openExternal(`http://localhost:${p.port}`) }} hint={titleOf(p.terminalId)}>
              <span className="ide-port"><ExternalLink size={11} />localhost:{p.port}</span>
            </MenuItem>
          ))}
          {snapshot && externalPorts.length > 0 && (
            <>
              <div className="ctx-menu-section" role="presentation">External ({externalPorts.length})</div>
              <div className="ide-port-list">{externalPorts.map((p) => <span key={`${p.port}:${p.pid}`} title={`${p.address} - pid ${p.pid}`}>{p.port}</span>)}</div>
            </>
          )}
        </IdeMenu>
      )}
    </>
  )
}
