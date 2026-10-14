import { useState } from 'react'
import { FolderPlus, GitBranchPlus, Search } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useJumpPaletteStore } from '../../store/jumpPaletteStore'
import { WorktreeLauncherModal } from '../../tabs/WorktreeLauncherModal'
import { ProjectTree, addProject } from './ProjectTree'
import { ResizeHandle } from './ResizeHandle'

/** Agent IDE sol kenar cubugu (PRD F1.1): arama, Projects basligi, agac. Tasks/Automations/Mobile Faz 3'te. */
export function IdeSidebar(): React.JSX.Element {
  const width = useSettingsStore((s) => s.settings.ide.sidebarWidth)
  const [worktreeOpen, setWorktreeOpen] = useState(false)
  const setWidth = (sidebarWidth: number): void => {
    const ide = useSettingsStore.getState().settings.ide
    void useSettingsStore.getState().update({ ide: { ...ide, sidebarWidth } })
  }
  return (
    <aside className="ide-sidebar" style={{ width }} aria-label="Projects and agents">
      <nav className="ide-nav">
        <button className="ide-nav-item" onClick={() => useJumpPaletteStore.getState().toggle()}>
          <Search size={14} /><span>Search</span><kbd>Ctrl+Shift+J</kbd>
        </button>
      </nav>
      <div className="ide-section-head">
        <span>Projects</span>
        <button className="ide-icon-btn" onClick={() => void addProject()} title="Add project folder" aria-label="Add project folder"><FolderPlus size={14} /></button>
        <button className="ide-icon-btn" onClick={() => setWorktreeOpen(true)} title="New worktree with an agent" aria-label="New worktree"><GitBranchPlus size={14} /></button>
      </div>
      <ProjectTree />
      <ResizeHandle edge="right" width={width} min={200} max={400} label="Resize projects sidebar" onChange={setWidth} />
      {worktreeOpen && <WorktreeLauncherModal onClose={() => setWorktreeOpen(false)} />}
    </aside>
  )
}
