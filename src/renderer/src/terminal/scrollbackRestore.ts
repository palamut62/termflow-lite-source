import type { Terminal } from '@xterm/xterm'
import { useSettingsStore } from '../store/settingsStore'

/**
 * scrollback-restore (docs/orca-parity/scrollback-restore.md): her TerminalView kendi
 * serilestiricisini kaydeder; degisen sekmeler dakikada bir, hepsi pencere kapanirken kaydedilir.
 */
const serializers = new Map<string, () => string>()
const dirty = new Set<string>()
const AUTOSAVE_MS = 60_000

const enabled = (): boolean => {
  const settings = useSettingsStore.getState().settings
  return settings.restoreScrollback && settings.restoreSession
}

export function registerSerializer(tabId: string, serialize: () => string): () => void {
  serializers.set(tabId, serialize)
  return () => {
    serializers.delete(tabId)
    dirty.delete(tabId)
  }
}

export function markScrollbackDirty(tabId: string): void {
  dirty.add(tabId)
}

function snapshot(tabIds: Iterable<string>): [string, string][] {
  const entries: [string, string][] = []
  for (const tabId of tabIds) {
    const serialize = serializers.get(tabId)
    if (!serialize) continue
    try { entries.push([tabId, serialize()]) } catch { /* sekme kapaniyor */ }
  }
  return entries
}

/** Yeniden acilan sekmenin eski ciktisini PTY baslamadan once basar. */
export async function restoreScrollback(term: Terminal, tabId: string): Promise<void> {
  if (!enabled()) return
  const saved = await window.termflow.scrollback.load(tabId).catch(() => null)
  if (!saved) return
  const stamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  term.write(`${saved.replace(/(?:\r?\n)+$/, '')}\r\n\x1b[0m\x1b[2m--- restored ${stamp} ---\x1b[0m\r\n`)
}

/** Dakikada bir degisen sekmeleri, pencere kapanirken hepsini kaydeder. Durduran fonksiyonu dondurur. */
export function startScrollbackAutosave(): () => void {
  const timer = setInterval(() => {
    if (!enabled() || dirty.size === 0) return
    const ids = [...dirty]
    dirty.clear()
    for (const [tabId, data] of snapshot(ids)) window.termflow.scrollback.save(tabId, data)
  }, AUTOSAVE_MS)
  const onUnload = (): void => {
    if (enabled()) window.termflow.scrollback.saveAllSync(snapshot(serializers.keys()))
  }
  window.addEventListener('beforeunload', onUnload)
  return () => {
    clearInterval(timer)
    window.removeEventListener('beforeunload', onUnload)
  }
}
