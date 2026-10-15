import { describe, expect, it } from 'vitest'
import { formatResetIn, liveWindows, parseClaudeRateLimits, parseCodexRateLimits, usageLevel } from './usage'

const now = 1_791_900_000_000

describe('parseCodexRateLimits', () => {
  it('reads the real token_count shape', () => {
    // Bu PC'deki Codex 0.162.1 rollout dosyasindan (2026-10-13).
    const line = JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { limit_id: 'codex', primary: { used_percent: 83.0, window_minutes: 300, resets_at: 1791907343 }, secondary: { used_percent: 14.0, window_minutes: 10080, resets_at: 1792473614 }, credits: { has_credits: false } } } })
    expect(parseCodexRateLimits(line, now)).toEqual({ agent: 'codex', updatedAt: now, windows: [
      { label: '5h', usedPercent: 83, resetsAt: 1791907343000 },
      { label: '7d', usedPercent: 14, resetsAt: 1792473614000 }
    ] })
  })

  it('ignores lines without limits and broken JSON', () => {
    expect(parseCodexRateLimits('{"payload":{"type":"token_count"}}', now)).toBeNull()
    expect(parseCodexRateLimits('{oops', now)).toBeNull()
  })
})

describe('parseClaudeRateLimits', () => {
  it('reads the status line windows and skips missing ones', () => {
    expect(parseClaudeRateLimits({ rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1738425600 } } }, now)?.windows)
      .toEqual([{ label: '5h', usedPercent: 23.5, resetsAt: 1738425600000 }])
    expect(parseClaudeRateLimits({ model: {} }, now)).toBeNull()
  })
})

it('drops expired windows and keeps Claude Code order, 5h before 7d whatever is used', () => {
  const windows = [{ label: '7d', usedPercent: 90, resetsAt: now + 1 }, { label: '5h', usedPercent: 30, resetsAt: now + 1 }, { label: 'old', usedPercent: 99, resetsAt: now - 1 }]
  expect(liveWindows(windows, now).map((w) => w.label)).toEqual(['5h', '7d'])
})

it('colours at 80 and 95 percent and formats the reset time', () => {
  expect([usageLevel(79), usageLevel(80), usageLevel(95)]).toEqual(['ok', 'warn', 'critical'])
  expect(formatResetIn(now + 134 * 60_000, now)).toBe('2h 14m')
  expect(formatResetIn(now + (3 * 1440 + 240) * 60_000, now)).toBe('3d 4h')
})
