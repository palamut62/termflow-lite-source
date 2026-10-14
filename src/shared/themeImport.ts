import type { ThemeColors } from './types'

/**
 * Baska terminallerin tema dosyalarini TermFlow paletine cevirir (terminal-polish).
 * Desteklenen: Windows Terminal JSON (`schemes[]` ya da tek sema), iTerm2 `.itermcolors`
 * (plist XML), Ghostty tema dosyasi (`palette = N=#rrggbb`).
 */
export type ThemeImport = { name: string; colors: ThemeColors } | { error: string }

const ANSI_KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const

function hex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i)
  return match ? `#${match[1].toLowerCase()}` : null
}

function complete(partial: Partial<Record<keyof ThemeColors, string | null>>, name: string): ThemeImport {
  const missing = [...ANSI_KEYS, 'background', 'foreground'].filter((key) => !partial[key as keyof ThemeColors])
  if (missing.length) return { error: `The theme is missing ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}.` }
  const colors = { ...partial } as ThemeColors
  colors.cursor = partial.cursor ?? colors.foreground
  colors.selection = partial.selection ?? colors.brightBlack
  return { name: name.slice(0, 60), colors }
}

function windowsTerminal(json: unknown, fallbackName: string): ThemeImport {
  const root = json as { schemes?: unknown[] }
  const scheme = (Array.isArray(root?.schemes) ? root.schemes[0] : json) as Record<string, unknown> | undefined
  if (!scheme || typeof scheme !== 'object') return { error: 'No color scheme found in the JSON file.' }
  const partial: Partial<Record<keyof ThemeColors, string | null>> = {
    background: hex(scheme.background),
    foreground: hex(scheme.foreground),
    cursor: hex(scheme.cursorColor),
    selection: hex(scheme.selectionBackground)
  }
  // Windows Terminal "purple" der, TermFlow "magenta".
  for (const key of ANSI_KEYS) partial[key] = hex(scheme[key === 'magenta' ? 'purple' : key.replace('Magenta', 'Purple')] ?? scheme[key])
  return complete(partial, typeof scheme.name === 'string' ? scheme.name : fallbackName)
}

function iterm(xml: string, fallbackName: string): ThemeImport {
  const entries = new Map<string, Record<string, number>>()
  for (const match of xml.matchAll(/<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)) {
    const components: Record<string, number> = {}
    for (const c of match[2].matchAll(/<key>([^<]+)<\/key>\s*<real>([^<]+)<\/real>/g)) components[c[1]] = Number(c[2])
    entries.set(match[1].trim(), components)
  }
  const color = (key: string): string | null => {
    const c = entries.get(key)
    if (!c || ![c['Red Component'], c['Green Component'], c['Blue Component']].every(Number.isFinite)) return null
    const byte = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
    return `#${byte(c['Red Component'])}${byte(c['Green Component'])}${byte(c['Blue Component'])}`
  }
  const partial: Partial<Record<keyof ThemeColors, string | null>> = {
    background: color('Background Color'),
    foreground: color('Foreground Color'),
    cursor: color('Cursor Color'),
    selection: color('Selection Color')
  }
  ANSI_KEYS.forEach((key, index) => { partial[key] = color(`Ansi ${index} Color`) })
  return complete(partial, fallbackName)
}

function ghostty(text: string, fallbackName: string): ThemeImport {
  const partial: Partial<Record<keyof ThemeColors, string | null>> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#')) continue
    const match = line.match(/^([\w-]+)\s*=\s*(.+)$/)
    if (!match) continue
    const [, key, value] = match
    if (key === 'palette') {
      const entry = value.match(/^(\d{1,2})\s*=\s*(#?[0-9a-f]{6})/i)
      if (entry && Number(entry[1]) < 16) partial[ANSI_KEYS[Number(entry[1])]] = hex(entry[2])
    } else if (key === 'background') partial.background = hex(value)
    else if (key === 'foreground') partial.foreground = hex(value)
    else if (key === 'cursor-color') partial.cursor = hex(value)
    else if (key === 'selection-background') partial.selection = hex(value)
  }
  return complete(partial, fallbackName)
}

export function parseThemeFile(fileName: string, text: string): ThemeImport {
  const name = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Imported'
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try { return windowsTerminal(JSON.parse(trimmed), name) } catch { return { error: 'The JSON file could not be read.' } }
  }
  if (trimmed.startsWith('<?xml') || trimmed.includes('<plist')) return iterm(trimmed, name)
  if (/^\s*(palette|background|foreground)\s*=/m.test(trimmed)) return ghostty(trimmed, name)
  return { error: 'Unknown theme format. Use a Windows Terminal JSON, iTerm2 .itermcolors or Ghostty theme file.' }
}
