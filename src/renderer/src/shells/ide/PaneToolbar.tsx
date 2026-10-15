import { useState } from 'react'
import { ArrowRightLeft, Columns2, Rows2, X } from 'lucide-react'
import { agentForProfile } from '../../../../shared/profiles'
import { useSettingsStore } from '../../store/settingsStore'
import { useTerminalStore } from '../../store/terminalStore'
import { useToastStore } from '../../store/toastStore'
import { agentProfileOptions, switchActiveAgentProfile } from '../../agentHandover'
import { IdeMenu, MenuItem, anchorOf, type MenuAnchor } from './IdeMenu'

/**
 * Agent IDE pane'inin sag ust dugmeleri (Orca 4.9): ajani baska ajana devret, saga / asagi bol, sekmeyi kapat.
 * Yalniz IDE modunda ve fare pane uzerindeyken gorunur (CSS).
 */
export function PaneToolbar({ tabId }: { tabId: string }): React.JSX.Element | null {
  const ide = useSettingsStore((s) => s.settings.uiMode === 'ide')
  const settings = useSettingsStore((s) => s.settings)
  const tab = useTerminalStore((s) => s.tabs.find((t) => t.id === tabId))
  const [handoff, setHandoff] = useState<MenuAnchor | null>(null)
  if (!ide || !tab) return null
  const agent = agentForProfile(settings, tab.profileId)
  const targets = agentProfileOptions(settings).filter((p) => p.id !== tab.profileId)

  const split = (dir: 'vertical' | 'horizontal'): void => {
    useTerminalStore.getState().setActiveTab(tabId)
    useTerminalStore.getState().splitActive(dir)
  }

  return (
    <div className="ide-pane-toolbar" onMouseDown={(e) => e.stopPropagation()}>
      {agent && (
        <button className="ide-icon-btn" onClick={(e) => setHandoff(anchorOf(e.currentTarget))} title="Hand off to another agent" aria-label="Hand off to another agent" aria-haspopup="menu">
          <ArrowRightLeft size={13} />
        </button>
      )}
      <button className="ide-icon-btn" onClick={() => split('vertical')} title="Split right (Ctrl+\)" aria-label="Split right"><Columns2 size={13} /></button>
      <button className="ide-icon-btn" onClick={() => split('horizontal')} title="Split down (Ctrl+Shift+\)" aria-label="Split down"><Rows2 size={13} /></button>
      <button className="ide-icon-btn" onClick={() => useTerminalStore.getState().requestCloseTab(tabId)} title="Close tab" aria-label="Close tab"><X size={13} /></button>
      {handoff && agent && (
        <IdeMenu anchor={handoff} label="Hand off to" onClose={() => setHandoff(null)} width={240}>
          <div className="ctx-menu-section" role="presentation">Continue this work with</div>
          {targets.length === 0 && <div className="ctx-menu-section" role="presentation">No other agent profile is set up.</div>}
          {targets.map((target) => (
            <MenuItem key={target.id} onSelect={() => {
              setHandoff(null)
              switchActiveAgentProfile(tab, target, agent).catch(() => useToastStore.getState().show('Hand off failed. The current session is unchanged.', 'error'))
            }}>{target.name}</MenuItem>
          ))}
        </IdeMenu>
      )}
    </div>
  )
}
