import { dialog, ipcMain, nativeImage, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { IPC } from '../../shared/ipc'
import type { BackgroundPick } from '../../shared/types'

export function registerDialogIpc(getWindow: () => BrowserWindow | null): void {
  // Tema ice aktarma (terminal-polish): yalniz metin doner, ayristirma renderer'da (shared/themeImport).
  ipcMain.handle(IPC.DIALOG_PICK_THEME, async (): Promise<{ name: string; text: string } | { error: string } | null> => {
    const window = getWindow()
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Terminal themes', extensions: ['json', 'itermcolors', 'conf', 'theme', 'txt', '*'] }]
    }
    const result = window && !window.isDestroyed() ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = result.canceled ? undefined : result.filePaths[0]
    if (!file) return null
    if ((await stat(file)).size > 1024 * 1024) return { error: 'The theme file is larger than 1 MB.' }
    return { name: basename(file), text: await readFile(file, 'utf8') }
  })

  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async () => {
    const window = getWindow()
    const result = window && !window.isDestroyed()
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  // Dosya seçici (ör. SSH identity file). Klasör seçiciyle aynı üslup:
  // pencere varsa modal, yoksa penceresiz; iptalde null.
  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async () => {
    const window = getWindow()
    const result = window && !window.isDestroyed()
      ? await dialog.showOpenDialog(window, { properties: ['openFile'] })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  // ASCII background: the picture is decoded and shrunk here, and only a small
  // JPEG data URL goes back. The renderer never gets a path or reads the file.
  ipcMain.handle(IPC.DIALOG_PICK_BACKGROUND, async (): Promise<BackgroundPick> => {
    const window = getWindow()
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
    }
    const result = window && !window.isDestroyed() ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const path = result.canceled ? undefined : result.filePaths[0]
    if (!path) return { status: 'canceled' }
    try {
      if ((await stat(path)).size > BACKGROUND_MAX_BYTES) return { status: 'invalid', reason: 'The image is larger than 30 MB.' }
    } catch {
      return { status: 'invalid', reason: 'The file could not be read.' }
    }
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return { status: 'invalid', reason: 'This file is not an image TermFlow Lite can read.' }
    const { width, height } = image.getSize()
    const scale = Math.min(1, BACKGROUND_MAX_SIDE / Math.max(width, height))
    const small = scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' }) : image
    return { status: 'ok', image: `data:image/jpeg;base64,${small.toJPEG(85).toString('base64')}` }
  })
}

/** Character cells are coarse, so a 640 px picture is already more than enough. */
const BACKGROUND_MAX_SIDE = 640
const BACKGROUND_MAX_BYTES = 30 * 1024 * 1024
