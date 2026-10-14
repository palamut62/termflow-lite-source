import { useState } from 'react'
import { Bell, CalendarClock, CircleHelp, FolderPlus, ListTodo, PanelLeft, Plus, Search, Settings, Smartphone, SquareTerminal } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useJumpPaletteStore } from '../../store/jumpPaletteStore'
import { useSavedCommandStore } from '../../store/savedCommandStore'
import { useAgentEventStore } from '../../store/agentEventStore'
import { useTerminalStore } from '../../store/terminalStore'
import { WorktreeLauncherModal } from '../../tabs/WorktreeLauncherModal'
import { GitHubPanel } from '../../components/GitHubPanel'
import { toggleUiMode } from '../uiMode'
import { ProjectTree, addProject } from './ProjectTree'
import { ResizeHandle } from './ResizeHandle'

/**
 * Agent IDE sol kenar cubugu (PRD 4.2, F1.1), Orca yerlesimi: ust satir (pencere surukleme), gezinme,
 * Projects basligi, agac, alt cubuk. Gezinme ogeleri mevcut ozellikleri acar.
 */
export function IdeSidebar(): React.JSX.Element {
  const ide = useSettingsStore((s) => s.settings.ide)
  const unseen = useTerminalStore((s) => s.tabs.filter((t) => t.attention).length)
  const [worktreeOpen, setWorktreeOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const save = (patch: Partial<typeof ide>): void => {
    void useSettingsStore.getState().update({ ide: { ...useSettingsStore.getState().settings.ide, ...patch } })
  }
  return (
    <aside className="ide-sidebar" style={{ width: ide.sidebarWidth }} aria-label="Projects and agents">
      <div className="ide-sidebar-top">
        <span className="ide-logo" aria-hidden="true"><SquareTerminal size={16} /></span>
        <span className="ide-sidebar-top-spacer" />
        <button className="ide-icon-btn" onClick={() => save({ sidebarOpen: false })} title="Hide sidebar" aria-label="Hide sidebar"><PanelLeft size={15} /></button>
      </div>
      <nav className="ide-nav" aria-label="Agent IDE">
        <button className="ide-nav-item ide-nav-search" onClick={() => useJumpPaletteStore.getState().toggle()} title="Search tabs, worktrees and sessions (Ctrl+Shift+J)">
          <Search size={14} /><span>Search</span>
        </button>
        <button className="ide-nav-item" onClick={() => setTasksOpen(true)} title="GitHub issues and pull requests"><ListTodo size={14} /><span>Tasks</span></button>
        <button className="ide-nav-item" onClick={() => useSavedCommandStore.getState().show()} title="Saved and scheduled commands"><CalendarClock size={14} /><span>Automations</span></button>
        <button className="ide-nav-item" onClick={() => useSettingsStore.getState().openSettings('remote')} title="Control this computer from your phone"><Smartphone size={14} /><span>Mobile</span></button>
      </nav>
      <div className="ide-section-head">
        <span>Projects</span>
        <button className="ide-icon-btn ide-bell" onClick={() => useAgentEventStore.getState().show()} title="Agent activity" aria-label={unseen ? `Agent activity, ${unseen} not seen` : 'Agent activity'}>
          <Bell size={13} />{unseen > 0 && <span className="ide-bell-dot" aria-hidden="true" />}
        </button>
        <button className="ide-icon-btn" onClick={() => void addProject()} title="Add project folder" aria-label="Add project folder"><FolderPlus size={13} /></button>
        <button className="ide-icon-btn" onClick={() => setWorktreeOpen(true)} title="New worktree with an agent" aria-label="New worktree"><Plus size={14} /></button>
      </div>
      <ProjectTree />
      <div className="ide-sidebar-foot">
        <button className="ide-icon-btn" onClick={() => useSettingsStore.getState().openSettings()} title="Settings (Ctrl+,)" aria-label="Settings"><Settings size={14} /></button>
        <button className="ide-icon-btn" onClick={() => useSettingsStore.getState().openSettings('about')} title="About and help" aria-label="About and help"><CircleHelp size={14} /></button>
        <span className="ide-sidebar-top-spacer" />
        <button className="ide-icon-btn" onClick={toggleUiMode} title="Switch to Terminal layout (Ctrl+Shift+I)" aria-label="Switch to Terminal layout"><SquareTerminal size={14} /></button>
      </div>
      <ResizeHandle edge="right" width={ide.sidebarWidth} min={200} max={400} label="Resize projects sidebar" onChange={(sidebarWidth) => save({ sidebarWidth })} />
      {worktreeOpen && <WorktreeLauncherModal onClose={() => setWorktreeOpen(false)} />}
      {tasksOpen && <GitHubPanel onClose={() => setTasksOpen(false)} />}
    </aside>
  )
}
