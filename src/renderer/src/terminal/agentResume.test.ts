import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AgentSession, type TerminalTab } from '../../../shared/types'
import { persistedResume, pickStartedSession } from './agentResume'

const session = (id: string, cwd: string, createdAt: number): AgentSession => ({ agent: 'codex', id, title: id, cwd, createdAt, updatedAt: createdAt })

describe('pickStartedSession', () => {
  const started = 1_000_000
  it('takes the newest session in the same folder that started with the tab', () => {
    const sessions = [session('old', 'C:\\repo', started - 60_000), session('mine', 'c:/repo/', started + 2_000), session('other', 'C:\\else', started + 3_000)]
    expect(pickStartedSession(sessions, 'C:\\Repo', started, new Set())).toBe('mine')
  })

  it('skips sessions another tab already owns', () => {
    const sessions = [session('a', '/r', started + 1_000), session('b', '/r', started + 2_000)]
    expect(pickStartedSession(sessions, '/r', started, new Set(['b']))).toBe('a')
    expect(pickStartedSession(sessions, '/r', started, new Set(['a', 'b']))).toBeNull()
  })
})

describe('persistedResume', () => {
  const tab = { id: 't', title: 'Claude', profileId: 'claude', running: true, activity: 'completed', startedAt: 0 } as TerminalTab
  it('saves the agent-reported session id for agent tabs', () => {
    expect(persistedResume({ ...tab, agentHook: { state: 'done', sessionId: 'abc', at: 0 } }, DEFAULT_SETTINGS)).toEqual({ agent: 'claude', id: 'abc' })
  })
  it('saves nothing when the setting is off', () => {
    const settings = { ...DEFAULT_SETTINGS, resumeAgentsOnRestore: false }
    expect(persistedResume({ ...tab, resumeSession: { agent: 'claude', id: 'x' } }, settings)).toBeUndefined()
  })
})
