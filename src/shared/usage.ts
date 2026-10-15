import type { AgentKind } from './types'

/** usage-meter (docs/orca-parity/usage-meter.md): ajanin kendi bildirdigi limit pencereleri. */
export interface UsageWindow {
  /** '5h', '7d' ya da saat cinsinden pencere. */
  label: string
  usedPercent: number
  /** Epoch ms. */
  resetsAt: number
}

export interface AgentUsage {
  agent: AgentKind
  windows: UsageWindow[]
  /** Verinin okundugu an (epoch ms). */
  updatedAt: number
}

export type UsageLevel = 'ok' | 'warn' | 'critical'

export function usageLevel(usedPercent: number): UsageLevel {
  if (usedPercent >= 95) return 'critical'
  if (usedPercent >= 80) return 'warn'
  return 'ok'
}

function windowLabel(minutes: number): string {
  if (minutes === 10080) return '7d'
  if (minutes % 1440 === 0) return `${minutes / 1440}d`
  return `${Math.round(minutes / 60)}h`
}

/** Suresi dolmus pencere gosterilmez; en sikisik once. */
/** Window length in minutes from its label ('5h', '7d', '90m'); unknown labels sort last. */
function windowMinutes(label: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([mhdw])/i.exec(label)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1]) * ({ m: 1, h: 60, d: 1440, w: 10080 } as Record<string, number>)[match[2]!.toLowerCase()]!
}

/** Live windows in Claude Code's own order: the shortest window first (5h, then 7d). */
export function liveWindows(windows: readonly UsageWindow[], now: number): UsageWindow[] {
  return windows.filter((w) => w.resetsAt > now).sort((a, b) => windowMinutes(a.label) - windowMinutes(b.label))
}

/**
 * Codex oturum dosyasindaki `token_count` olayi (~/.codex/sessions/.../rollout-*.jsonl):
 * `rate_limits.primary|secondary = { used_percent, window_minutes, resets_at (epoch sn) }`.
 */
export function parseCodexRateLimits(line: string, now: number): AgentUsage | null {
  let parsed: unknown
  try { parsed = JSON.parse(line) } catch { return null }
  const limits = (parsed as { payload?: { rate_limits?: Record<string, unknown> } })?.payload?.rate_limits
  if (!limits || typeof limits !== 'object') return null
  const windows: UsageWindow[] = []
  for (const key of ['primary', 'secondary']) {
    const w = limits[key] as { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown } | null | undefined
    if (!w || typeof w.used_percent !== 'number' || typeof w.window_minutes !== 'number' || typeof w.resets_at !== 'number') continue
    windows.push({ label: windowLabel(w.window_minutes), usedPercent: Math.min(100, Math.max(0, w.used_percent)), resetsAt: w.resets_at * 1000 })
  }
  return windows.length ? { agent: 'codex', windows, updatedAt: now } : null
}

/**
 * Claude Code status line JSON'u: `rate_limits.five_hour|seven_day = { used_percentage, resets_at (epoch sn) }`.
 * Yalniz Pro/Max'ta ve oturumdaki ilk API cevabindan sonra gelir; pencereler tek tek eksik olabilir.
 */
export function parseClaudeRateLimits(json: unknown, now: number): AgentUsage | null {
  const limits = (json as { rate_limits?: Record<string, unknown> })?.rate_limits
  if (!limits || typeof limits !== 'object') return null
  const windows: UsageWindow[] = []
  for (const [key, label] of [['five_hour', '5h'], ['seven_day', '7d']] as const) {
    const w = limits[key] as { used_percentage?: unknown; resets_at?: unknown } | null | undefined
    if (!w || typeof w.used_percentage !== 'number' || typeof w.resets_at !== 'number') continue
    windows.push({ label, usedPercent: Math.min(100, Math.max(0, w.used_percentage)), resetsAt: w.resets_at * 1000 })
  }
  return windows.length ? { agent: 'claude', windows, updatedAt: now } : null
}

/** "2h 14m" / "3d 4h" / "12m" */
export function formatResetIn(resetsAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((resetsAt - now) / 60_000))
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return `${minutes}m`
}
