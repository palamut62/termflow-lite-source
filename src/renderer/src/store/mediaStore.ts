import { create } from 'zustand'
import type { MediaInfo } from '../../../shared/ipc'

export type MediaSource = 'drop' | 'paste' | 'new'

export interface MediaItem extends MediaInfo {
  id: number
  tabId: string
  source: MediaSource
  addedAt: number
  /** Kart pane'de açık mı; false ise yalnızca bilgi şeridinde kutucuk. */
  card: boolean
}

/** Sekme başına tutulan en fazla öğe (kutucuklar); kartlar en fazla 3. */
const MAX_PER_TAB = 8
export const MAX_CARDS = 3

interface MediaState {
  items: MediaItem[]
  /** Tam ekran açık öğe. */
  viewing: number | null
  add(tabId: string, info: MediaInfo, source: MediaSource): void
  collapse(id: number): void
  remove(id: number): void
  clearTab(tabId: string): void
  view(id: number | null): void
}

let nextId = 1

export const useMediaStore = create<MediaState>()((set, get) => ({
  items: [],
  viewing: null,
  add(tabId, info, source) {
    const now = Date.now()
    // Aynı dosya tekrar gelirse eskisi düşer, yenisi öne çıkar.
    const rest = get().items.filter((item) => !(item.tabId === tabId && item.path === info.path))
    const mine = [...rest.filter((item) => item.tabId === tabId), { ...info, id: nextId++, tabId, source, addedAt: now, card: true }]
    // En eski kartlar kutucuğa iner; sınırı aşan en eski öğeler silinir.
    const openCards = mine.filter((item) => item.card)
    const demote = new Set(openCards.slice(0, Math.max(0, openCards.length - MAX_CARDS)).map((item) => item.id))
    const kept = mine.slice(-MAX_PER_TAB).map((item) => (demote.has(item.id) ? { ...item, card: false } : item))
    set({ items: [...rest.filter((item) => item.tabId !== tabId), ...kept] })
  },
  collapse(id) {
    set({ items: get().items.map((item) => (item.id === id ? { ...item, card: false } : item)) })
  },
  remove(id) {
    set({ items: get().items.filter((item) => item.id !== id), viewing: get().viewing === id ? null : get().viewing })
  },
  clearTab(tabId) {
    set({ items: get().items.filter((item) => item.tabId !== tabId) })
  },
  view(id) {
    set({ viewing: id })
  }
}))

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|ico|mp4|webm|mov|m4v|ogv)$/i

/** Bırakılan/yapıştırılan bir yol medya ise kartını açar. */
export function reportMedia(tabId: string, path: string, source: MediaSource, mode: 'off' | 'manual' | 'all'): void {
  if (mode === 'off' || !MEDIA_EXT.test(path)) return
  void window.termflow.media.inspect(path).then((info) => {
    if (info) useMediaStore.getState().add(tabId, info, source)
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
