import type { AsciiBackground, AsciiCharset } from './types'

/** Glyph ramps from empty to full. Index 0 is always a space so dark areas stay clear. */
export const ASCII_RAMPS: Record<AsciiCharset, string> = {
  dots: ' .·:•',
  ascii: ' .:-=+*#%@',
  blocks: ' ░▒▓█'
}

export const ASCII_DENSITY = { min: 4, max: 16 } as const
export const ASCII_OPACITY = { min: 5, max: 60 } as const
/** Upper bound for the stored data URL (the main process makes ~20-80 kB JPEGs). */
export const ASCII_IMAGE_MAX_CHARS = 600_000

export const DEFAULT_ASCII_BACKGROUND: Omit<AsciiBackground, 'image'> = {
  density: 6,
  opacity: 22,
  charset: 'dots'
}

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

/** Keeps only well-formed entries; anything else (paths, URLs, huge strings) is dropped. */
export function normalizeAsciiBackgrounds(value: unknown): Record<string, AsciiBackground> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, AsciiBackground> = {}
  for (const [profileId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Partial<AsciiBackground>
    if (typeof entry.image !== 'string' || entry.image.length > ASCII_IMAGE_MAX_CHARS || !IMAGE_DATA_URL.test(entry.image)) continue
    out[profileId] = {
      image: entry.image,
      density: clamp(entry.density, ASCII_DENSITY.min, ASCII_DENSITY.max, DEFAULT_ASCII_BACKGROUND.density),
      opacity: clamp(entry.opacity, ASCII_OPACITY.min, ASCII_OPACITY.max, DEFAULT_ASCII_BACKGROUND.opacity),
      charset: entry.charset && entry.charset in ASCII_RAMPS ? entry.charset : DEFAULT_ASCII_BACKGROUND.charset
    }
  }
  return out
}

/**
 * Turns RGBA pixels (one pixel per character cell) into one string per row.
 * Brightness is stretched to the picture's own range so dim photos still show;
 * `invert` maps dark pixels to dense glyphs, for light terminal themes.
 */
export function glyphRows(rgba: ArrayLike<number>, cols: number, rows: number, charset: AsciiCharset, invert: boolean): string[] {
  const ramp = ASCII_RAMPS[charset]
  const luma = new Float32Array(cols * rows)
  let lo = 1
  let hi = 0
  for (let i = 0; i < luma.length; i++) {
    const o = i * 4
    // Transparent pixels count as background.
    const alpha = rgba[o + 3] / 255
    const l = ((0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255) * alpha
    luma[i] = l
    if (l < lo) lo = l
    if (l > hi) hi = l
  }
  const span = hi - lo > 0.04 ? hi - lo : 1
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      let l = (luma[r * cols + c] - (span === 1 ? 0 : lo)) / span
      if (invert) l = 1 - l
      line += ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(l * (ramp.length - 1))))]
    }
    out.push(line)
  }
  return out
}
