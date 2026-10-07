import { app, clipboard, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { isAbsolute, join } from 'path'
import { savePastedImage } from '../pastedImages'
import { IPC } from '../../shared/ipc'

/**
 * Read the system clipboard text on the main side. The sandboxed renderer's
 * navigator.clipboard.readText() needs a clipboard-read permission that can be
 * flaky, so paste goes through a single IPC path (PRD §24).
 */
export function registerClipboardIpc(): void {
  ipcMain.handle(IPC.CLIPBOARD_READ, () => clipboard.readText())
  // Yazma da main üzerinden: renderer'da navigator.clipboard.writeText,
  // pencere odaklı değilse/permission yoksa sessizce başarısız olabiliyor.
  ipcMain.handle(IPC.CLIPBOARD_WRITE, (_event, text: unknown): boolean => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 8192) return false
    clipboard.writeText(text)
    return true
  })
  ipcMain.handle(IPC.CLIPBOARD_READ_PASTE, () => {
    if (process.platform === 'win32') {
      const filePath = clipboard.readBuffer('FileNameW').toString('utf16le').replace(/\0+$/g, '').trim()
      if (filePath && isAbsolute(filePath) && existsSync(filePath)) return { kind: 'file' as const, value: filePath }
    }
    const text = clipboard.readText()
    if (text) return { kind: 'text' as const, value: text }
    // Yalnız resim (ekran alıntısı, "resmi kopyala"): PNG'ye kaydedip yolunu
    // dosya gibi yapıştır; ajanlar resmi bu yoldan okur.
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      try {
        return { kind: 'file' as const, value: savePastedImage(image.toPNG(), join(app.getPath('temp'), 'termflow-lite-paste')) }
      } catch {
        return { kind: 'text' as const, value: '' }
      }
    }
    return { kind: 'text' as const, value: '' }
  })
}
