import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseScmChecks, parseScmLog, parseScmStatus, readScmDiff, untrackedDiff, validPaths, validRef } from './scm'

describe('parseScmStatus', () => {
  it('reads branch, upstream, ahead/behind and files including renames', () => {
    const out = '## main...origin/main [ahead 2, behind 30]\0 M src/a.ts\0A  new file.ts\0R  b.ts\0old b.ts\0?? notes/x.md\0'
    expect(parseScmStatus(out)).toEqual({
      branch: 'main', upstream: 'origin/main', ahead: 2, behind: 30,
      files: [
        { index: ' ', work: 'M', path: 'src/a.ts' },
        { index: 'A', work: ' ', path: 'new file.ts' },
        { index: 'R', work: ' ', path: 'b.ts' },
        { index: '?', work: '?', path: 'notes/x.md' }
      ]
    })
  })

  it('handles a branch without upstream, an unborn branch and detached HEAD', () => {
    expect(parseScmStatus('## fix-login\0')).toMatchObject({ branch: 'fix-login', upstream: '', ahead: 0 })
    expect(parseScmStatus('## No commits yet on main\0')).toMatchObject({ branch: 'main', upstream: '' })
    expect(parseScmStatus('## HEAD (no branch)\0')).toMatchObject({ branch: 'HEAD', upstream: '' })
  })
})

it('parses log lines and gh check JSON', () => {
  expect(parseScmLog('abc1234\x1ffix: login\x1fUmut\x1f2 hours ago\n')).toEqual([{ hash: 'abc1234', subject: 'fix: login', author: 'Umut', when: '2 hours ago' }])
  expect(parseScmChecks('[{"name":"build","state":"SUCCESS","link":"https://x","workflow":"CI"}]')).toEqual([{ name: 'build', state: 'SUCCESS', link: 'https://x', workflow: 'CI' }])
  expect(parseScmChecks('{}')).toEqual([])
})

it('rejects flag-like or non-string paths', () => {
  expect(validPaths(['src/a.ts'])).toEqual(['src/a.ts'])
  expect(validPaths(['--force'])).toBeNull()
  expect(validPaths([1])).toBeNull()
  expect(validPaths([])).toBeNull()
})

it('accepts plain base refs only', () => {
  expect(validRef('origin/main')).toBe(true)
  expect(validRef('feature/x-1')).toBe(true)
  expect(validRef('--output=x')).toBe(false)
  expect(validRef('main..evil')).toBe(false)
  expect(validRef('a b')).toBe(false)
})

it('formats an untracked file as a new-file diff', () => {
  expect(untrackedDiff('n.txt', Buffer.from('a\r\nb\n'))).toBe('diff --git a/n.txt b/n.txt\nnew file mode 100644\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1,2 @@\n+a\n+b\n')
  expect(untrackedDiff('img.png', null)).toContain('Binary files')
})

it('diffs the working tree against HEAD and against a base branch, untracked files included', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'termflow-scm-diff-'))
  const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, windowsHide: true, stdio: 'ignore' }) }
  try {
    git('init', '-b', 'main')
    git('config', 'user.email', 'e2e@example.invalid')
    git('config', 'user.name', 'TermFlow Test')
    writeFileSync(join(repo, 'a.txt'), 'one\n')
    git('add', '.')
    git('commit', '-m', 'init')
    git('checkout', '-b', 'feature')
    writeFileSync(join(repo, 'b.txt'), 'committed on feature\n')
    git('add', '.')
    git('commit', '-m', 'feature')
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    writeFileSync(join(repo, 'new.txt'), 'fresh\n')

    const head = await readScmDiff(repo, '')
    expect(head.error).toBeUndefined()
    expect(head.text).toContain('+two')
    expect(head.text).toContain('+++ b/new.txt')
    expect(head.text).not.toContain('b.txt')

    const base = await readScmDiff(repo, 'main')
    expect(base.text).toContain('+committed on feature')
    expect(base.text).toContain('+two')
    expect((await readScmDiff(repo, '--evil')).error).toBe('Invalid base ref.')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}, 20000)
