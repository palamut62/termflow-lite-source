import { create } from 'zustand'
import type { AgentPermissionMode, TabWorktree } from '../../../shared/types'
import { setupKey, type WorktreeSetupSteps } from '../../../shared/worktreeSetup'
import { useSettingsStore } from './settingsStore'
import { useTerminalStore } from './terminalStore'

export interface PendingSetup {
  worktree: TabWorktree
  steps: WorktreeSetupSteps
  profileId: string
  permissionMode?: AgentPermissionMode
}

export const useWorktreeSetupStore = create<{ pending: PendingSetup | null; clear(): void }>()((set) => ({
  pending: null,
  clear: () => set({ pending: null })
}))

/**
 * Yeni olusturulan worktree'de sekmeyi acar; depo icin kurulum adimi varsa once onlar
 * calisir (WorktreeSetupDialog). `steps` verilmezse kayitli adimlar kullanilir.
 */
export function openNewWorktree(worktree: TabWorktree, profileId: string, permissionMode?: AgentPermissionMode, steps?: WorktreeSetupSteps): void {
  const setup = steps ?? useSettingsStore.getState().settings.worktreeSetup[setupKey(worktree.repoRoot)]
  if (setup?.enabled && (setup.copyFiles.length > 0 || setup.commands.length > 0)) {
    useWorktreeSetupStore.setState({ pending: { worktree, steps: setup, profileId, permissionMode } })
    return
  }
  useTerminalStore.getState().addTab(profileId, true, undefined, undefined, permissionMode, worktree)
}
