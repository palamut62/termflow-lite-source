/**
 * Panel genisligini surukleyerek degistirir. `edge`: tutamacin panelin hangi kenarinda oldugu
 * (sol panelde 'right', sag panelde 'left'). Klavye: sol/sag ok 16 px.
 */
export function ResizeHandle({ edge, width, min, max, label, onChange }: {
  edge: 'left' | 'right'
  width: number
  min: number
  max: number
  label: string
  onChange: (width: number) => void
}): React.JSX.Element {
  const clamp = (value: number): number => Math.round(Math.min(max, Math.max(min, value)))
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = width
    handle.setPointerCapture(event.pointerId)
    const onMove = (move: PointerEvent): void => {
      const delta = move.clientX - startX
      onChange(clamp(edge === 'right' ? startWidth + delta : startWidth - delta))
    }
    const onUp = (up: PointerEvent): void => {
      try { handle.releasePointerCapture(up.pointerId) } catch { /* already released */ }
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const grow = (event.key === 'ArrowRight') === (edge === 'right')
    onChange(clamp(width + (grow ? 16 : -16)))
    event.preventDefault()
  }
  return (
    <div
      className={`ide-resize ide-resize-${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}
