import { create } from 'zustand'
import { useTerminalStore } from './terminalStore'

interface JumpPaletteState {
  open: boolean
  hide(): void
  toggle(): void
}

export const useJumpPaletteStore = create<JumpPaletteState>()((set) => ({
  open: false,
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open }))
}))

/** Sekme id -> en son aktif oldugu (ya da aktiflikten ciktigi) an; "son aktif sekmeler" sirasi. */
export const lastSeen = new Map<string, number>()

export function trackTabRecency(): () => void {
  let previous = useTerminalStore.getState().activeTabId
  return useTerminalStore.subscribe((state) => {
    if (state.activeTabId === previous) return
    const now = Date.now()
    // Birakilan sekme de "simdi goruldu" sayilir; boylece bir onceki sekme listede ilk olur (Alt+Tab gibi).
    if (previous) lastSeen.set(previous, now)
    if (state.activeTabId) lastSeen.set(state.activeTabId, now)
    previous = state.activeTabId
  })
}
