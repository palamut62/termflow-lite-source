import { expect, it } from 'vitest'
import { parseWorktreeTarget } from './worktreeTarget'

it('reads #PR, PR and issue URLs, and plain names', () => {
  expect(parseWorktreeTarget('  ')).toBeNull()
  expect(parseWorktreeTarget('#42')).toEqual({ kind: 'pr', number: 42 })
  expect(parseWorktreeTarget('https://github.com/palamut62/shop/pull/7/files')).toEqual({ kind: 'pr', number: 7, repo: 'palamut62/shop' })
  expect(parseWorktreeTarget('https://github.com/palamut62/shop/issues/12')).toEqual({ kind: 'branch', branch: 'issue-12', issue: 12 })
  expect(parseWorktreeTarget('fix/login')).toEqual({ kind: 'branch', branch: 'fix/login' })
  expect(parseWorktreeTarget('https://gitlab.com/a/b/-/issues/3')).toEqual({ kind: 'branch', branch: 'https://gitlab.com/a/b/-/issues/3' })
})
