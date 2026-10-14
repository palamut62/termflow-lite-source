import { describe, expect, it } from 'vitest'
import type { AgentSession, TerminalTab } from '../../shared/types'
import { IDLE_LIMIT, idleTabs, matchScore, searchJump, type JumpItem } from './jumpRanking'

function tab(id: string, overrides: Partial<TerminalTab> = {}): TerminalTab {
  return { id, title: id, profileId: 'bash', running: true, activity: 'running', startedAt: 0, ...overrides }
}

function session(id: string, overrides: Partial<AgentSession> = {}): AgentSession {
  return { agent: 'claude', id, title: id, updatedAt: 0, ...overrides }
}

const ids = (items: JumpItem[]): string[] => items.map((item) => (item.kind === 'tab' ? item.tab.id : item.session.id))

describe('idleTabs', () => {
  it('puts tabs waiting for you first, then the most recently seen, and skips the active tab', () => {
    const tabs = [
      tab('active'),
      tab('old'),
      tab('recent'),
      tab('done', { attention: 'done' }),
      tab('input', { attention: 'needs-input' }),
      tab('error', { attention: 'error' })
    ]
    const lastSeen = new Map([['old', 10], ['recent', 50], ['active', 99]])
    expect(ids(idleTabs(tabs, 'active', lastSeen))).toEqual(['input', 'error', 'done', 'recent', 'old'])
  })

  it('shows at most nine rows', () => {
    const tabs = Array.from({ length: 12 }, (_, i) => tab(`t${i}`))
    expect(idleTabs(tabs, null, new Map())).toHaveLength(IDLE_LIMIT)
  })

  it('dates a waiting tab by its event, not by when it was last seen', () => {
    const waiting = tab('w', { attention: 'needs-input', agentHook: { state: 'needs-input', at: 500 } })
    expect(idleTabs([waiting], null, new Map([['w', 10]]))[0].at).toBe(500)
  })
})

describe('matchScore', () => {
  it('ranks a word-start match over an inner match over a fuzzy one', () => {
    expect(matchScore('api', 'C:\\work\\api-server')).toBe(3)
    expect(matchScore('api', 'rapid')).toBe(2)
    expect(matchScore('aps', 'a-p-server')).toBe(1)
    expect(matchScore('xyz', 'api')).toBe(0)
    expect(matchScore('api', undefined)).toBe(0)
  })
})

describe('searchJump', () => {
  it('puts tabs whose folder or branch contains the query on top', () => {
    const tabs = [
      tab('shell', { cwd: 'C:\\Users\\me\\web' }),
      tab('folder', { cwd: 'C:\\Users\\me\\api' }),
      tab('branch', { cwd: 'C:\\Users\\me\\web', worktree: { path: 'C:\\wt\\x', branch: 'feature/api-auth', repoRoot: 'C:\\Users\\me\\web', createdByApp: true } })
    ]
    expect(ids(searchJump('api', tabs, [], new Map()))).toEqual(['branch', 'folder'])
  })

  it('lists recent agent sessions after equally good tabs and hides ones already open', () => {
    const tabs = [tab('t', { title: 'deploy', resumeSession: { agent: 'claude', id: 'open' } })]
    const sessions = [session('open', { title: 'deploy fix' }), session('s1', { title: 'deploy notes', updatedAt: 5 })]
    expect(ids(searchJump('deploy', tabs, sessions, new Map()))).toEqual(['t', 's1'])
  })

  it('returns nothing for a blank query', () => {
    expect(searchJump('  ', [tab('a')], [], new Map())).toEqual([])
  })
})
