import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Yapıştırılan resimler bu kadar gün saklanır; ajanın sonradan okuyabilmesi için. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000

function stamp(now: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`
  )
}

/**
 * Panodaki resmi (yalnız bitmap, dosya yolu yok: ekran alıntısı, tarayıcıda
 * "resmi kopyala") PNG olarak kaydeder ve yolunu döner; terminale bu yol
 * yapıştırılır. 7 günden eski yapıştırma resimleri aynı anda silinir.
 */
export function savePastedImage(png: Buffer, dir: string, now = new Date()): string {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('clipboard-') || !name.endsWith('.png')) continue
    const file = join(dir, name)
    try {
      if (now.getTime() - statSync(file).mtimeMs > KEEP_MS) unlinkSync(file)
    } catch {
      // Başka bir süreç tutuyor ya da çoktan silinmiş; sonraki yapıştırmada tekrar denenir.
    }
  }
  const file = join(dir, `clipboard-${stamp(now)}.png`)
  writeFileSync(file, png)
  return file
}
