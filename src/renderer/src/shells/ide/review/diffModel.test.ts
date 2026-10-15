import { describe, expect, it } from 'vitest'
import { formatReviewPrompt, lineAnchor, parseUnifiedDiff, splitRows } from './diffModel'

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,4 +1,4 @@',
  ' keep',
  '-old one',
  '-old two',
  '+new one',
  ' tail',
  '\\ No newline at end of file',
  'diff --git a/n.txt b/n.txt',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/n.txt',
  '@@ -0,0 +1,1 @@',
  '+hello',
  'diff --git a/old.ts b/moved.ts',
  'similarity index 100%',
  'rename from old.ts',
  'rename to moved.ts',
  'diff --git a/logo.png b/logo.png',
  'Binary files a/logo.png and b/logo.png differ',
  ''
].join('\n')

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(DIFF)

  it('reads files, statuses and counts', () => {
    expect(files.map((f) => [f.path, f.status, f.additions, f.deletions, f.binary])).toEqual([
      ['src/a.ts', 'modified', 1, 2, false],
      ['n.txt', 'added', 1, 0, false],
      ['moved.ts', 'renamed', 0, 0, false],
      ['logo.png', 'modified', 0, 0, true]
    ])
    expect(files[2]?.oldPath).toBe('old.ts')
  })

  it('numbers old and new lines', () => {
    const lines = files[0]!.hunks[0]!.lines
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['ctx', 1, 1], ['del', 2, undefined], ['del', 3, undefined], ['add', undefined, 2], ['ctx', 4, 3]
    ])
  })

  it('pairs deletions with additions for the split view', () => {
    const rows = splitRows(files[0]!.hunks[0]!)
    expect(rows.map((r) => [r.left?.text, r.right?.text])).toEqual([
      ['keep', 'keep'], ['old one', 'new one'], ['old two', undefined], ['tail', 'tail']
    ])
  })
})

describe('formatReviewPrompt', () => {
  it('groups comments by file in line order, removed lines marked', () => {
    const del = parseUnifiedDiff(DIFF)[0]!.hunks[0]!.lines[1]!
    expect(lineAnchor(del)).toEqual({ line: 2, side: 'old' })
    const prompt = formatReviewPrompt([
      { id: '2', path: 'src/a.ts', line: 3, side: 'new', code: 'tail', body: 'Rename this.' },
      { id: '1', path: 'src/a.ts', line: 2, side: 'old', code: 'old one', body: 'Why removed?\nKeep it.' },
      { id: '3', path: 'n.txt', line: 1, side: 'new', code: 'hello', body: 'Typo' }
    ], 'main')
    expect(prompt).toBe([
      'Please address these review comments on the changes against main in this worktree:',
      '', '## src/a.ts',
      '', '- Removed line 2: `old one`', '  Why removed?', '  Keep it.',
      '', '- Line 3: `tail`', '  Rename this.',
      '', '## n.txt',
      '', '- Line 1: `hello`', '  Typo'
    ].join('\n'))
  })
})
