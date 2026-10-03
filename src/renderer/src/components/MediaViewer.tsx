import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Clipboard, CornerDownLeft, ExternalLink, FolderOpen, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useMediaStore } from '../store/mediaStore'
import { useToastStore } from '../store/toastStore'
import { insertMediaPath, mediaMeta } from './MediaCards'

/**
 * Önizleme kartının tam görünümü. Dosya `termflow-media://` üzerinden gelir;
 * ana süreç yalnızca daha önce incelenmiş medya dosyalarını sunar.
 */
export function MediaViewer(): React.JSX.Element | null {
  const viewing = useMediaStore((s) => s.viewing)
  const item = useMediaStore((s) => s.items.find((i) => i.id === s.viewing))
  const siblings = useMediaStore(useShallow((s) => (item ? s.items.filter((i) => i.tabId === item.tabId) : [])))
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = (): void => useMediaStore.getState().view(null)
  const index = item ? siblings.findIndex((i) => i.id === item.id) : -1
  const step = (dir: -1 | 1): void => {
    const next = siblings[index + dir]
    if (next) useMediaStore.getState().view(next.id)
  }

  useEffect(() => {
    if (viewing === null) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (viewing === null || !item) return null
  const src = window.termflow.media.url(item.path)

  return (
    <div className="media-viewer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="media-viewer" role="dialog" aria-label={`Preview of ${item.name}`}>
        <header className="media-viewer-bar">
          <div className="media-viewer-title">
            <strong title={item.path}>{item.name}</strong>
            <span>{mediaMeta(item).join(', ')}</span>
          </div>
          <button type="button" onClick={() => void window.termflow.system.openPath(item.path)} title="Open in the default app"><ExternalLink size={14} />Open</button>
          <button type="button" onClick={() => void window.termflow.system.revealInFolder(item.path)} title="Show in folder"><FolderOpen size={14} />Folder</button>
          <button
            type="button"
            onClick={() => {
              void window.termflow.clipboard.writeText(item.path)
              useToastStore.getState().show('Path copied.', 'success')
            }}
            title="Copy path"
          ><Clipboard size={14} />Copy path</button>
          <button
            type="button"
            onClick={() => {
              insertMediaPath(item.tabId, item.path)
              close()
            }}
            title="Insert the path into the command line"
          ><CornerDownLeft size={14} />Insert path</button>
          <button ref={closeRef} type="button" className="media-viewer-close" onClick={close} aria-label="Close preview" title="Close (Esc)"><X size={16} /></button>
        </header>
        <div className="media-viewer-stage">
          {index > 0 && <button type="button" className="media-viewer-nav media-viewer-prev" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={22} /></button>}
          {item.kind === 'video'
            ? <video key={item.id} src={src} controls autoPlay muted playsInline />
            : <img key={item.id} src={src} alt={item.name} />}
          {index < siblings.length - 1 && <button type="button" className="media-viewer-nav media-viewer-next" onClick={() => step(1)} aria-label="Next"><ChevronRight size={22} /></button>}
        </div>
      </div>
    </div>
  )
}
