import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { ScrollbackStore } from '../storage/ScrollbackStore'

/** scrollback-restore: renderer serilestirir, ana surec maskeleyip diske yazar. */
export function registerScrollbackIpc(store: ScrollbackStore, enabled: () => boolean): void {
  const save = (tabId: unknown, data: unknown): void => {
    if (!enabled() || typeof tabId !== 'string' || typeof data !== 'string') return
    try { store.save(tabId, data) } catch (error) { console.warn('[scrollback] save failed:', error) }
  }
  ipcMain.on(IPC.SCROLLBACK_SAVE, (_event, tabId: unknown, data: unknown) => save(tabId, data))
  // Pencere kapanirken: renderer yazma bitene kadar bekler, yoksa cikista kayit yarim kalir.
  ipcMain.on(IPC.SCROLLBACK_SAVE_ALL_SYNC, (event, entries: unknown) => {
    if (Array.isArray(entries)) for (const entry of entries) if (Array.isArray(entry)) save(entry[0], entry[1])
    event.returnValue = true
  })
  ipcMain.handle(IPC.SCROLLBACK_LOAD, (_event, tabId: unknown) => (enabled() && typeof tabId === 'string' ? store.load(tabId) : null))
  ipcMain.on(IPC.SCROLLBACK_REMOVE, (_event, tabId: unknown) => { if (typeof tabId === 'string') store.remove(tabId) })
  ipcMain.on(IPC.SCROLLBACK_CLEAR, () => store.clear())
}
