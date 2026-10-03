import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import { inspectMedia, unwatchMediaTab, watchMediaDir } from '../media'

/** Terminal önizleme kartları (bkz. src/main/media.ts). */
export function registerMediaIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.MEDIA_INSPECT, (_event, path: unknown) => inspectMedia(path))
  ipcMain.on(IPC.MEDIA_WATCH, (_event, tabId: unknown, dir: unknown) => {
    if (typeof tabId !== 'string' || tabId.length > 200) return
    unwatchMediaTab(tabId)
    if (typeof dir !== 'string' || dir.length === 0 || dir.length > 4096) return
    watchMediaDir(dir, tabId, (tabIds, info) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send(IPC.MEDIA_NEW, tabIds, info)
    })
  })
}
