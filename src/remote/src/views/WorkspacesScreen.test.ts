import { describe, expect, it } from 'vitest'
import type { RemoteTab } from '../../../shared/remote'
import { groupWorkspaces } from './WorkspacesScreen'

const tab = (id: string, extra: Partial<RemoteTab>): RemoteTab => ({ id, title: id, profileId: 'claude', running: true, activity: 'running', visible: true, ...extra })

describe('groupWorkspaces', () => {
  it('groups tabs by project and workspace, primary checkout first', () => {
    const wt = { repoRoot: 'C:\\p\\app', path: 'C:\\p\\app\\.wt\\fix', branch: 'fix', createdByApp: true }
    const projects = groupWorkspaces([tab('a', { worktree: wt }), tab('b', { cwd: 'C:/p/app' }), tab('c', { cwd: 'C:\\p\\app\\' }), tab('d', { cwd: 'C:/p/other' })])
    expect(projects.map((p) => p.name)).toEqual(['app', 'other'])
    expect(projects[0]!.workspaces.map((w) => [w.name, w.tabs.map((t) => t.id)])).toEqual([['app', ['b', 'c']], ['fix', ['a']]])
  })
})
