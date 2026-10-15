import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { noteFile, readNote, writeNote } from './notes'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('worktree notes', () => {
  it('round-trips a note per worktree and keeps worktrees apart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'termflow-notes-'))
    dirs.push(dir)
    const a = join(tmpdir(), 'repo-a')
    const b = join(tmpdir(), 'repo-b')
    expect(readNote(dir, a)).toBe('')
    expect(writeNote(dir, a, '# A\n- todo')).toBe(true)
    expect(writeNote(dir, b, 'B')).toBe(true)
    expect(readNote(dir, `${a}/`)).toBe('# A\n- todo')
    expect(readNote(dir, b)).toBe('B')
    expect(noteFile(dir, a)).not.toBe(noteFile(dir, b))
  })

  it('rejects relative paths and non-string text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'termflow-notes-'))
    dirs.push(dir)
    expect(writeNote(dir, 'relative/path', 'x')).toBe(false)
    expect(writeNote(dir, join(tmpdir(), 'r'), 42)).toBe(false)
    expect(readNote(dir, 'relative')).toBe('')
  })
})
