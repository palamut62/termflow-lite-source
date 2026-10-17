import { Bot, Files, GitBranch, ListChecks, Network, PanelRight } from 'lucide-react'
import type { IdeRightTab } from '../../../../shared/types'
import { useSettingsStore } from '../../store/settingsStore'
import { FilePanel } from '../../components/FilePanel'
import { AgentsPanel } from './AgentsPanel'
import { DelegatedPanel } from './DelegatedPanel'
import { ChecksPanel, SourceControlPanel } from './ScmPanel'
import { ResizeHandle } from './ResizeHandle'

const TABS: { id: IdeRightTab; label: string; icon: React.JSX.Element }[] = [
  { id: 'explorer', label: 'Explorer (Ctrl+Shift+E)', icon: <Files size={15} /> },
  { id: 'agents', label: 'Agents (Ctrl+Shift+A)', icon: <Bot size={15} /> },
  { id: 'delegated', label: 'Delegated tasks', icon: <Network size={15} /> },
  { id: 'scm', label: 'Source Control (Ctrl+Shift+G)', icon: <GitBranch size={15} /> },
  { id: 'checks', label: 'Checks (Ctrl+Shift+K)', icon: <ListChecks size={15} /> }
]

/**
 * Agent IDE sag paneli (PRD 4.3, F1.4), Orca yerlesimi: ust satir pencere dugmelerinin altinda kalir,
 * altinda yalniz ikonlu sekmeler.
 */
export function RightPanel(): React.JSX.Element {
  const ide = useSettingsStore((s) => s.settings.ide)
  const save = (patch: Partial<typeof ide>): void => {
    void useSettingsStore.getState().update({ ide: { ...useSettingsStore.getState().settings.ide, ...patch } })
  }
  return (
    <aside className="ide-right" style={{ width: ide.rightWidth }} aria-label="Workspace panel">
      <ResizeHandle edge="left" width={ide.rightWidth} min={220} max={560} label="Resize workspace panel" onChange={(rightWidth) => save({ rightWidth })} />
      <div className={`ide-right-top${window.termflow?.system.platform === 'win32' ? ' ide-right-top-win' : ''}`}>
        <button className="ide-icon-btn ide-icon-on" onClick={() => save({ rightOpen: false })} title="Hide right panel" aria-label="Hide workspace panel"><PanelRight size={15} /></button>
      </div>
      <div className="ide-right-tabs" role="tablist" aria-label="Workspace panel">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={ide.rightTab === tab.id}
            aria-label={tab.label.replace(/ \(.*\)$/, '')}
            title={tab.label}
            className={ide.rightTab === tab.id ? 'ide-right-tab ide-right-tab-on' : 'ide-right-tab'}
            onClick={() => save({ rightTab: tab.id })}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      <div className="ide-right-body" role="tabpanel">
        {ide.rightTab === 'explorer' ? <FilePanel embedded /> : ide.rightTab === 'agents' ? <AgentsPanel /> : ide.rightTab === 'delegated' ? <DelegatedPanel /> : ide.rightTab === 'scm' ? <SourceControlPanel /> : <ChecksPanel />}
      </div>
    </aside>
  )
}
