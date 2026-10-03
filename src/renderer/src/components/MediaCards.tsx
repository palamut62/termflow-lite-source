import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Clipboard, CornerDownLeft, FolderOpen, Image as ImageIcon, Maximize2, Play, X } from 'lucide-react'
import { formatBytes, MAX_CARDS, useMediaStore, type MediaItem } from '../store/mediaStore'
import { useToastStore } from '../store/toastStore'

/** Kartın kendiliğinden bilgi şeridine inmeden önce açık kaldığı süre. */
const CARD_MS = 7000

const SOURCE_LABEL: Record<MediaItem['source'], string> = {
  drop: 'Dropped',
  paste: 'Pasted',
  new: 'New in folder'
}

export function mediaMeta(item: MediaItem): string[] {
  const parts: string[] = []
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`)
  parts.push(formatBytes(item.size))
  return parts
}

/** Komut satırına yolu yazar (Enter'a basılmaz); boşluk içeren yollar tırnaklanır. */
export function insertMediaPath(tabId: string, path: string): void {
  window.termflow.pty.write(tabId, JSON.stringify(path))
}

export function MediaThumb({ item, className = '' }: { item: MediaItem; className?: string }): React.JSX.Element {
  return (
    <span className={`media-thumb ${className}`}>
      {item.thumbnail ? <img src={item.thumbnail} alt="" draggable={false} /> : <ImageIcon size={22} />}
      {item.kind === 'video' && <span className="media-play" aria-hidden="true"><Play size={12} /></span>}
    </span>
  )
}

function MediaCard({ item }: { item: MediaItem }): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { collapse, view } = useMediaStore.getState()

  // Fare üzerindeyken süre durur; ayrılınca baştan başlar.
  useEffect(() => {
    if (hover) return
    timer.current = setTimeout(() => collapse(item.id), CARD_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [hover, item.id, collapse])

  const copyPath = (): void => {
    void window.termflow.clipboard.writeText(item.path)
    useToastStore.getState().show('Path copied.', 'success')
  }

  return (
    <div
      className="media-card"
      role="group"
      aria-label={`${item.kind === 'video' ? 'Video' : 'Image'} preview: ${item.name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className="media-card-preview" type="button" onClick={() => view(item.id)} title="Open preview">
        <MediaThumb item={item} />
      </button>
      <div className="media-card-info">
        <div className="media-card-name" title={item.path}>{item.name}</div>
        <div className="media-card-meta">
          <span>{SOURCE_LABEL[item.source]}</span>
          {mediaMeta(item).map((part) => <span key={part}>{part}</span>)}
        </div>
        <div className="media-card-actions">
          <button type="button" onClick={() => view(item.id)} title="Open preview" aria-label="Open preview"><Maximize2 size={13} /></button>
          <button type="button" onClick={() => void window.termflow.system.revealInFolder(item.path)} title="Show in folder" aria-label="Show in folder"><FolderOpen size={13} /></button>
          <button type="button" onClick={copyPath} title="Copy path" aria-label="Copy path"><Clipboard size={13} /></button>
          <button type="button" onClick={() => insertMediaPath(item.tabId, item.path)} title="Insert path into the command line" aria-label="Insert path"><CornerDownLeft size={13} /></button>
        </div>
      </div>
      <button className="media-card-close" type="button" onClick={() => collapse(item.id)} title="Hide card (stays in the info strip)" aria-label="Hide card"><X size={12} /></button>
    </div>
  )
}

/** Pane'in sağ alt köşesinde açık önizleme kartları (en fazla 3). */
export function MediaCards({ tabId }: { tabId: string }): React.JSX.Element | null {
  const cards = useMediaStore(useShallow((s) => s.items.filter((item) => item.tabId === tabId && item.card).slice(-MAX_CARDS)))
  if (cards.length === 0) return null
  return (
    <div className="media-cards" aria-live="polite">
      {cards.map((item) => <MediaCard key={item.id} item={item} />)}
    </div>
  )
}

/** Bilgi şeridindeki kutucuklar: kartı kapanan öğeler burada kalır. */
export function MediaChips({ tabId }: { tabId: string }): React.JSX.Element | null {
  const items = useMediaStore(useShallow((s) => s.items.filter((item) => item.tabId === tabId && !item.card)))
  if (items.length === 0) return null
  return (
    <span className="media-chips" aria-label="Recent media">
      {items.slice(-5).map((item) => (
        <button
          key={item.id}
          type="button"
          className="media-chip"
          title={`${item.name} - click to preview`}
          onClick={() => useMediaStore.getState().view(item.id)}
        >
          <MediaThumb item={item} className="media-thumb-chip" />
        </button>
      ))}
    </span>
  )
}
