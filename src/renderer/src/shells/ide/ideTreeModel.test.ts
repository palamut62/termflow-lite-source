import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../../shared/types'
import type { WorktreeEntry } from '../../../../shared/ipc'
import { buildIdeTree, formatAge, isInside, mostUrgent, sessionState } from './ideTreeModel'

const tab = (id: string, cwd: string, extra: Partial<TerminalTab> = {}): TerminalTab =>
  ({ id, title: id, profileId: 'claude', running: true, activity: 'completed', startedAt: 1000, cwd, launchCwd: cwd, ...extra }) as TerminalTab
const wt = (path: string, branch: string | null): WorktreeEntry => ({ path, head: 'abc', branch, detached: !branch, bare: false, locked: false })

describe('buildIdeTree', () => {
  const root = 'C:\\repo'
  const feature = 'C:\\repo\\.termflow-worktrees\\fix-login'
  const base = {
    projects: [root],
    worktrees: new Map([[root, [wt('C:/repo', 'main'), wt('C:/repo/.termflow-worktrees/fix-login', 'fix-login')]]]),
    repoRoots: new Map<string, string>(),
    activeTabId: 'b',
    agentOf: () => 'claude' as const
  }

  it('puts each tab under the deepest worktree, primary checkout first', () => {
    const tree = buildIdeTree({ ...base, tabs: [tab('a', 'C:\\repo\\src'), tab('b', feature, { worktree: { path: feature, branch: 'fix-login', repoRoot: root } as TerminalTab['worktree'] })] })
    expect(tree).toHaveLength(1)
    const [primary, child] = tree[0].worktrees
    expect(primary).toMatchObject({ branch: 'main', primary: true })
    expect(primary.sessions.map((s) => s.tabId)).toEqual(['a'])
    expect(child).toMatchObject({ branch: 'fix-login', primary: false })
    expect(child.sessions[0]).toMatchObject({ tabId: 'b', active: true })
  })

  it('adds the project of an open tab even when it was never added, and keeps non-git folders', () => {
    const tree = buildIdeTree({ ...base, projects: [], worktrees: new Map(), repoRoots: new Map([['D:\\notes', 'D:\\notes']]), tabs: [tab('n', 'D:\\notes')] })
    expect(tree[0]).toMatchObject({ root: 'D:\\notes', label: 'notes' })
    expect(tree[0].worktrees[0]).toMatchObject({ primary: true, branch: null })
    expect(tree[0].worktrees[0].sessions[0].tabId).toBe('n')
  })

  it('lists a project once regardless of slashes and case', () => {
    expect(buildIdeTree({ ...base, projects: ['C:\\repo', 'c:/repo/'], tabs: [] })).toHaveLength(1)
  })
})

describe('session state', () => {
  it('prefers what the agent reported, then the shell activity', () => {
    expect(sessionState(tab('x', '/', { agentHook: { state: 'needs-input', at: 5 } }), 'claude')).toBe('needs-input')
    expect(sessionState(tab('x', '/', { activity: 'running' }), 'claude')).toBe('working')
    expect(sessionState(tab('x', '/', { activity: 'running' }), null)).toBe('idle')
    expect(sessionState(tab('x', '/', { activity: 'error' }), null)).toBe('error')
    // Hook'lu Claude ilk olaydan once prompt bekliyor; cikti tahmini "Working" demesin.
    expect(sessionState(tab('x', '/', { activity: 'running' }), 'claude', true)).toBe('idle')
    expect(sessionState(tab('x', '/', { activity: 'running' }), 'opencode', true)).toBe('working')
  })

  it('picks the most urgent state for a collapsed group', () => {
    expect(mostUrgent([{ state: 'done' }, { state: 'needs-input' }, { state: 'working' }] as never)).toBe('needs-input')
    expect(mostUrgent([{ state: 'idle' }] as never)).toBeNull()
  })
})

it('matches folders by path segment and formats ages', () => {
  expect(isInside('C:\\repo\\src', 'c:/repo')).toBe(true)
  expect(isInside('C:\\repo2', 'C:\\repo')).toBe(false)
  expect([formatAge(0, 30_000), formatAge(0, 6 * 60_000), formatAge(0, 6 * 3_600_000), formatAge(0, 50 * 3_600_000)]).toEqual(['now', '6m', '6h', '2d'])
})
