import { Bot, FolderTree, X } from 'lucide-react'
import type { IdeRightTab } from '../../../../shared/types'
import { useSettingsStore } from '../../store/settingsStore'
import { FilePanel } from '../../components/FilePanel'
import { AgentsPanel } from './AgentsPanel'
import { ResizeHandle } from './ResizeHandle'

const TABS: { id: IdeRightTab; label: string; icon: React.JSX.Element }[] = [
  { id: 'explorer', label: 'Explorer', icon: <FolderTree size={13} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={13} /> }
]

/** Agent IDE sag paneli (PRD F1.4). Source Control ve Checks Faz 2'de eklenir. */
export function RightPanel(): React.JSX.Element {
  const ide = useSettingsStore((s) => s.settings.ide)
  const save = (patch: Partial<typeof ide>): void => {
    void useSettingsStore.getState().update({ ide: { ...useSettingsStore.getState().settings.ide, ...patch } })
  }
  return (
    <aside className="ide-right" style={{ width: ide.rightWidth }} aria-label="Workspace panel">
      <ResizeHandle edge="left" width={ide.rightWidth} min={220} max={560} label="Resize workspace panel" onChange={(rightWidth) => save({ rightWidth })} />
      <div className="ide-right-tabs" role="tablist" aria-label="Workspace panel">
        {TABS.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={ide.rightTab === tab.id} className={ide.rightTab === tab.id ? 'ide-right-tab ide-right-tab-on' : 'ide-right-tab'} onClick={() => save({ rightTab: tab.id })}>
            {tab.icon}<span>{tab.label}</span>
          </button>
        ))}
        <button className="ide-icon-btn ide-right-close" onClick={() => save({ rightOpen: false })} title="Hide panel" aria-label="Hide workspace panel"><X size={13} /></button>
      </div>
      <div className="ide-right-body" role="tabpanel">
        {ide.rightTab === 'explorer' ? <FilePanel embedded /> : <AgentsPanel />}
      </div>
    </aside>
  )
}
