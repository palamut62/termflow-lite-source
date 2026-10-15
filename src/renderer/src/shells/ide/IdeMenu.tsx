import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuAnchor { left: number; right: number; top: number; bottom: number }

export function anchorOf(element: Element): MenuAnchor {
  const r = element.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
}

/**
 * Agent IDE acilir menusu/popover'i: dugmeye baglanir, pencereden tasmaz (tasan oge odak alinca uygulama kayardi),
 * disari tiklama, Escape ve pencere odak kaybinda kapanir. `up`: dugmenin ustune acilir (alt cubuklar).
 */
export function IdeMenu({ anchor, up = false, width, label, onClose, children, className = '' }: {
  anchor: MenuAnchor
  up?: boolean
  width?: number
  label: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width: w, height: h } = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8))
    const top = up ? anchor.top - h - 4 : anchor.bottom + 4
    setPos({ left, top: Math.max(8, Math.min(top, window.innerHeight - h - 8)) })
  }, [anchor.left, anchor.top, anchor.bottom, up])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`ctx-menu ide-menu ${className}`}
      role="menu"
      aria-label={label}
      style={{ left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.bottom, width, visibility: pos ? undefined : 'hidden' }}
    >
      {children}
    </div>
  )
}

export function MenuItem({ onSelect, children, hint, danger = false, checked }: {
  onSelect: () => void
  children: React.ReactNode
  hint?: string
  danger?: boolean
  checked?: boolean
}): React.JSX.Element {
  return (
    <button
      className={`ctx-menu-item ide-menu-item${danger ? ' ide-menu-danger' : ''}`}
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      onClick={onSelect}
    >
      {checked !== undefined && <span className="ide-menu-check" aria-hidden="true">{checked ? '✓' : ''}</span>}
      <span className="ide-menu-text">{children}</span>
      {hint && <kbd className="ide-menu-hint">{hint}</kbd>}
    </button>
  )
}
