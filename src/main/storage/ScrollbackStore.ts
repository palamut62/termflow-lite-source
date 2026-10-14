import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { redactApiKeysInAnsi } from '../../shared/secretRedaction'

/**
 * scrollback-restore (docs/orca-parity/scrollback-restore.md): her sekmenin son
 * ciktisi userData/scrollback/<tabId>.txt. Yazmadan once API anahtarlari maskelenir.
 * Sekme basina 1 MB, toplamda 50 MB; asilinca en eski dosyalar silinir.
 */
export const MAX_TAB_BYTES = 1024 * 1024
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const TAB_ID = /^[\w-]{1,64}$/

/** Bayt sinirini asan icerigin sonunu satir basindan baslayarak tutar (yarim ANSI dizisi kalmaz). */
export function trimToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text
  const tail = Buffer.from(text).subarray(-maxBytes).toString('utf8')
  const lineStart = tail.indexOf('\n')
  return lineStart >= 0 ? tail.slice(lineStart + 1) : ''
}

export class ScrollbackStore {
  constructor(private readonly dir: string, private readonly maxTotal = MAX_TOTAL_BYTES) {}

  private file(tabId: string): string | null {
    return TAB_ID.test(tabId) ? join(this.dir, `${tabId}.txt`) : null
  }

  save(tabId: string, data: string): void {
    const file = this.file(tabId)
    if (!file || typeof data !== 'string') return
    mkdirSync(this.dir, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, trimToBytes(redactApiKeysInAnsi(data), MAX_TAB_BYTES), 'utf8')
    renameSync(temp, file)
    this.enforceTotal()
  }

  load(tabId: string): string | null {
    const file = this.file(tabId)
    if (!file) return null
    try { return readFileSync(file, 'utf8') } catch { return null }
  }

  remove(tabId: string): void {
    const file = this.file(tabId)
    if (file) rmSync(file, { force: true })
  }

  /** Oturumda olmayan sekmelerin dosyalari (kapanan sekmeler, eski oturumlar) silinir. */
  prune(keepIds: readonly string[]): void {
    const keep = new Set(keepIds.map((id) => `${id}.txt`))
    for (const name of this.list()) if (!keep.has(name)) rmSync(join(this.dir, name), { force: true })
  }

  clear(): void {
    rmSync(this.dir, { recursive: true, force: true })
  }

  private list(): string[] {
    try { return readdirSync(this.dir).filter((name) => name.endsWith('.txt')) } catch { return [] }
  }

  private enforceTotal(): void {
    const files = this.list().map((name) => {
      const path = join(this.dir, name)
      const info = statSync(path)
      return { path, size: info.size, mtime: info.mtimeMs }
    }).sort((a, b) => a.mtime - b.mtime)
    let total = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files) {
      if (total <= this.maxTotal) break
      try { unlinkSync(file.path) } catch { /* zaten silinmis */ }
      total -= file.size
    }
  }
}
