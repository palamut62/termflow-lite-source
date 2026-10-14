import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readClaudeUsage, readCodexUsage } from './agentUsage'

const line = (used: number): string => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { primary: { used_percent: used, window_minutes: 300, resets_at: 2_000_000_000 } } } })

describe('readCodexUsage', () => {
  it('reads the last rate limits from the newest rollout of the newest day', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tf-codex-'))
    const oldDay = join(root, '2026', '10', '12'); const newDay = join(root, '2026', '10', '13')
    mkdirSync(oldDay, { recursive: true }); mkdirSync(newDay, { recursive: true })
    writeFileSync(join(oldDay, 'rollout-a.jsonl'), line(5) + '\n')
    writeFileSync(join(newDay, 'rollout-b.jsonl'), [line(40), '{"type":"other"}', line(83), ''].join('\n'))
    writeFileSync(join(newDay, 'rollout-c.jsonl'), line(1) + '\n')
    utimesSync(join(newDay, 'rollout-c.jsonl'), new Date(1000), new Date(1000))
    const usage = await readCodexUsage(root, 1)
    expect(usage?.windows[0]).toMatchObject({ label: '5h', usedPercent: 83 })
  })

  it('returns null when Codex has no sessions', async () => {
    expect(await readCodexUsage(join(tmpdir(), 'tf-codex-missing-xyz'))).toBeNull()
  })
})

it('reads the Claude usage file written by the status line helper', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tf-claude-')), 'claude.json')
  writeFileSync(file, JSON.stringify({ rate_limits: { seven_day: { used_percentage: 41.2, resets_at: 2_000_000_000 } } }))
  expect((await readClaudeUsage(file))?.windows).toEqual([{ label: '7d', usedPercent: 41.2, resetsAt: 2_000_000_000_000 }])
  expect(await readClaudeUsage(file + '.missing')).toBeNull()
})
