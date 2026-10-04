import type { AppSettings, ThemeColors } from '../../shared/types'

/** Backdrop yalnızca Windows'ta (11 22H2+) gerçek bir malzeme çizer. */
export function backdropActive(settings: Pick<AppSettings, 'backdrop'>): boolean {
  return window.termflow?.system.platform === 'win32' && settings.backdrop !== 'none'
}

export function backdropAlpha(settings: Pick<AppSettings, 'backdropTint'>): number {
  const tint = Number.isFinite(settings.backdropTint) ? settings.backdropTint : 78
  return Math.min(100, Math.max(20, tint))
}

/**
 * xterm teması: imleç rengi override'ı + backdrop açıkken saydam arka plan
 * (renk tonu .terminal-area katmanından gelir, iki kez karartılmaz).
 */
export function terminalTheme(
  colors: ThemeColors,
  settings: Pick<AppSettings, 'cursorColor' | 'backdrop'>,
  transparent = backdropActive(settings)
): ThemeColors {
  const theme = settings.cursorColor ? { ...colors, cursor: settings.cursorColor } : { ...colors }
  if (transparent && /^#[0-9a-fA-F]{6}$/.test(theme.background)) theme.background = `${theme.background}00`
  return theme
}

/** True for light theme backgrounds (#rrggbb); unknown formats count as dark. */
export function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(hex)
  if (!m) return false
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
}
