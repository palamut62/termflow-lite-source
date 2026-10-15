import { describe, expect, it } from 'vitest'
import { lastUsedTab, scopeMapEquals, scopedTabs } from './workspaceScope'

const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const byTab = new Map([['a', '/repo'], ['b', '/repo/.wt/x'], ['c', '/repo']])

describe('workspace scope', () => {
  it('shows only the tabs of the active tab worktree, loose tabs together', () => {
    expect(scopedTabs(tabs, byTab, 'c').map((t) => t.id)).toEqual(['a', 'c'])
    expect(scopedTabs(tabs, byTab, 'b').map((t) => t.id)).toEqual(['b'])
    expect(scopedTabs(tabs, byTab, 'd').map((t) => t.id)).toEqual(['d'])
    expect(scopedTabs(tabs, new Map(), 'a')).toHaveLength(4)
  })

  it('returns to the most recently viewed tab of a worktree', () => {
    expect(lastUsedTab(['a', 'c'], new Map([['a', 5], ['c', 9]]))).toBe('c')
    expect(lastUsedTab(['a', 'c'], new Map())).toBe('a')
    expect(lastUsedTab([], new Map())).toBeUndefined()
  })

  it('compares maps by content', () => {
    expect(scopeMapEquals(byTab, new Map(byTab))).toBe(true)
    expect(scopeMapEquals(byTab, new Map([['a', '/repo']]))).toBe(false)
  })
})
