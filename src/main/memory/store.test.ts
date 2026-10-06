import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearProjectRootCache, normalizePath, projectKey, projectRoot, projectSlug } from './projectKey'
import { MemoryStore, parseFrontmatter, RETENTION_MS, sessionFileName, statusLine, type StoredSession } from './store'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'termflow-store-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  clearProjectRootCache()
})

const NOW = Date.parse('2026-10-06T12:00:00Z')
const session = (id: string, updatedAt: number, key = 'k1', summary = true): StoredSession => ({
  agent: 'claude', id, source: { mtime: updatedAt, size: 10 }, updatedAt, projectKey: key, projectPath: '/p',
  summary: summary ? { goal: 'g', done: [], unfinished: [], problems: [], decisions: [], lastState: '' } : null
})

describe('project keys', () => {
  it('uses the git root of a nested folder', () => {
    const root = tempDir()
    mkdirSync(join(root, '.git'))
    mkdirSync(join(root, 'src', 'deep'), { recursive: true })
    expect(projectRoot(join(root, 'src', 'deep'))).toBe(root)
    expect(projectKey(join(root, 'src'))).toBe(normalizePath(root))
  })

  it('falls back to the folder itself outside git', () => {
    const dir = tempDir()
    expect(projectRoot(dir)).toBe(dir)
  })

  it('normalizes Windows paths case-insensitively and builds safe slugs', () => {
    expect(normalizePath('C:\\Work\\App\\', 'win32')).toBe(normalizePath('c:/work/app', 'win32'))
    expect(projectSlug('c:\\users\\me\\projects\\TermFlow Lite')).toMatch(/^termflow-lite-[0-9a-f]{8}$/)
    expect(projectSlug('/')).toMatch(/^project-[0-9a-f]{8}$/)
    expect(sessionFileName('codex', '../x/y')).toBe('codex-.._x_y.json')
  })
})

describe('MemoryStore', () => {
  it('stores sessions and prunes the ones older than 30 days or excluded', () => {
    const store = new MemoryStore(tempDir())
    store.putSession(session('old', NOW - RETENTION_MS - 1, 'k1'))
    store.putSession(session('new', NOW - 1000, 'k1'))
    store.putSession(session('hidden', NOW - 1000, 'k2'))
    store.putSession(session('empty', NOW - 500, 'k1', false))
    const affected = store.prune(NOW, new Set(['k2']))
    expect([...affected].sort()).toEqual(['k1', 'k2'])
    expect(store.listSessions().map((item) => item.id).sort()).toEqual(['empty', 'new'])
    expect(store.sessionsForProject('k1').map((item) => item.id)).toEqual(['new'])
    expect(store.getSession('claude', 'new')?.updatedAt).toBe(NOW - 1000)
    expect(store.getSession('claude', 'missing')).toBeNull()
  })

  it('writes, lists, indexes and forgets projects', () => {
    const store = new MemoryStore(tempDir())
    expect(store.listProjects()).toEqual([])
    store.putSession(session('a', NOW, 'c:\\repo'))
    store.writeProject('c:\\repo', '---\nproject: C:\\Repo\nkey: c:\\repo\ngeneratedAt: 2026-10-06T12:00:00.000Z\nlastSessionAt: 2026-10-06T11:00:00.000Z\nsessions: 1\n---\n## Status\n- Shipping v2\n')
    const [project] = store.listProjects()
    expect(project).toMatchObject({ key: 'c:\\repo', path: 'C:\\Repo', sessions: 1, status: 'Shipping v2', lastSessionAt: Date.parse('2026-10-06T11:00:00Z') })
    store.writeIndex(NOW)
    expect(store.readIndex()).toContain('C:\\Repo | last activity 2026-10-06 | 1 sessions | Shipping v2')
    store.forgetProject('c:\\repo')
    expect(store.readProject('c:\\repo')).toBeNull()
    expect(store.listSessions()).toEqual([])
  })

  it('keeps run state and clears everything', () => {
    const dir = tempDir()
    const store = new MemoryStore(dir)
    expect(store.getState()).toEqual({})
    store.setState({ lastRunAt: 1 })
    expect(store.setState({ lastError: 'x' })).toEqual({ lastRunAt: 1, lastError: 'x' })
    store.clear()
    expect(store.getState()).toEqual({})
    expect(store.readIndex()).toBeNull()
  })

  it('parses frontmatter and status lines', () => {
    expect(parseFrontmatter('no frontmatter')).toEqual({})
    expect(parseFrontmatter('---\na: 1\nb: x: y\n---\nbody')).toEqual({ a: '1', b: 'x: y' })
    expect(statusLine('## Status\n\nAll good\n## Done')).toBe('All good')
    expect(statusLine('## Done\n- x')).toBe('')
  })
})
