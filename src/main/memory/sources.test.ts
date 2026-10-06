import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { jsonlSources, listSources, readDigest, sessionIdFromFile } from './sources'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'termflow-sources-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function file(path: string, content: string, mtime: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  utimesSync(path, mtime / 1000, mtime / 1000)
}

describe('session sources', () => {
  it('finds recent Claude transcripts and skips subagents, empty and old files', async () => {
    const root = tempDir()
    const now = Date.now()
    file(join(root, 'C--repo', 'aaa.jsonl'), '{}', now)
    file(join(root, 'C--repo', 'aaa', 'subagents', 'agent-1.jsonl'), '{}', now)
    file(join(root, 'C--repo', 'empty.jsonl'), '', now)
    file(join(root, 'C--repo', 'old.jsonl'), '{}', now - 40 * 86_400_000)
    file(join(root, 'C--repo', 'notes.txt'), 'x', now)
    const sources = await jsonlSources('claude', root, now - 30 * 86_400_000)
    expect(sources.map((source) => source.id)).toEqual(['aaa'])
    expect(sources[0]).toMatchObject({ agent: 'claude', size: 2 })
    expect(await jsonlSources('claude', join(root, 'missing'), 0)).toEqual([])
  })

  it('derives Codex ids from rollout file names', () => {
    expect(sessionIdFromFile('codex', '/s/rollout-2026-10-06T08-25-31-01a10fac-966f-7e33-a8af-8cd799272141.jsonl')).toBe('01a10fac-966f-7e33-a8af-8cd799272141')
    expect(sessionIdFromFile('codex', '/s/odd.jsonl')).toBe('odd')
    expect(sessionIdFromFile('claude', 'C:\\p\\abc.jsonl')).toBe('abc')
  })

  it('lists sources newest first and reads digests from files', async () => {
    const claude = tempDir()
    const codex = tempDir()
    const now = Date.now()
    file(join(claude, 'p', 'c1.jsonl'), JSON.stringify({ type: 'user', sessionId: 'c1', cwd: '/repo', message: { content: 'Fix the flaky test please' } }), now - 5000)
    file(join(codex, '2026', 'rollout-x-01a10fac-966f-7e33-a8af-8cd799272141.jsonl'), JSON.stringify({ type: 'session_meta', payload: { id: '01a10fac-966f-7e33-a8af-8cd799272141', cwd: '/r' } }), now)
    const sources = await listSources(now - 86_400_000, { claude, codex, opencode: false })
    expect(sources.map((source) => source.agent)).toEqual(['codex', 'claude'])
    const digest = await readDigest(sources[1])
    expect(digest).toMatchObject({ id: 'c1', cwd: '/repo', userMessages: ['Fix the flaky test please'] })
    await expect(readDigest({ agent: 'claude', id: 'x', mtime: 0, size: 0 })).rejects.toThrow('missing')
  })
})
