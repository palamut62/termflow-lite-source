import { useEffect, useRef, useState } from 'react'
import { glyphRows } from '../../../shared/asciiBackground'
import type { AsciiBackground } from '../../../shared/types'

interface Props {
  background: AsciiBackground
  /** Glyph colour, normally the theme foreground. */
  color: string
  /** Light themes: dark pixels get the dense glyphs. */
  invert: boolean
  fontFamily: string
}

/** Monospace glyphs are roughly 0.6 times as wide as they are tall. */
const CELL_ASPECT = 1.7

/**
 * The profile's picture as ASCII behind the terminal text. It is drawn once
 * and again only when the pane is resized or a setting changes: no animation,
 * so it costs nothing while you work.
 */
export function AsciiBackdrop({ background, color, invert, fontFamily }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    let live = true
    const img = new Image()
    img.onload = () => {
      if (live) setImage(img)
    }
    img.src = background.image
    return () => {
      live = false
      img.onload = null
    }
  }, [background.image])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    let frame = 0
    const draw = (): void => {
      frame = 0
      paint(canvas, image, background, color, invert, fontFamily)
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(canvas)
    schedule()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [image, background, color, invert, fontFamily])

  return <canvas ref={canvasRef} className="ascii-backdrop" aria-hidden="true" />
}

function paint(canvas: HTMLCanvasElement, image: HTMLImageElement, bg: AsciiBackground, color: string, invert: boolean, fontFamily: string): void {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const ctx = canvas.getContext('2d')
  if (!ctx || width < 1 || height < 1) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const cellW = bg.density
  const cellH = bg.density * CELL_ASPECT
  const cols = Math.ceil(width / cellW)
  const rows = Math.ceil(height / cellH)

  // Cover-fit: fill the pane, crop the overflow evenly, keep proportions.
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sw = width / scale
  const sh = height / scale
  const sample = document.createElement('canvas')
  sample.width = cols
  sample.height = rows
  const sctx = sample.getContext('2d', { willReadFrequently: true })
  if (!sctx) return
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, rows)
  const lines = glyphRows(sctx.getImageData(0, 0, cols, rows).data, cols, rows, bg.charset, invert)

  // One fillText per row; letterSpacing pins every glyph to its cell.
  // A bare family name is quoted; an invalid font string would be ignored silently.
  const family = /[,'"]/.test(fontFamily) ? fontFamily : `"${fontFamily}"`
  ctx.font = `${(cellH * 0.92).toFixed(2)}px ${family}, monospace`
  ctx.textBaseline = 'middle'
  const glyphW = ctx.measureText('M').width
  ctx.letterSpacing = `${(cellW - glyphW).toFixed(3)}px`
  ctx.fillStyle = color
  ctx.globalAlpha = bg.opacity / 100
  for (let r = 0; r < rows; r++) ctx.fillText(lines[r], 0, r * cellH + cellH / 2)
}
