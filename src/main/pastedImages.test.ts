import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { savePastedImage } from './pastedImages'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'tf-pasted-'))
  dirs.push(d)
  return d
}

describe('savePastedImage', () => {
  it('writes the PNG with a timestamped name and returns its path', () => {
    const dir = join(tempDir(), 'nested')
    const file = savePastedImage(Buffer.from('png-bytes'), dir, new Date(2026, 9, 7, 9, 5, 3, 42))
    expect(basename(file)).toBe('clipboard-20261007-090503-042.png')
    expect(readFileSync(file, 'utf8')).toBe('png-bytes')
  })

  it('deletes pasted images older than seven days and leaves other files alone', () => {
    const dir = tempDir()
    const now = new Date(2026, 9, 7, 12, 0, 0)
    const old = join(dir, 'clipboard-20260901-000000-000.png')
    const recent = join(dir, 'clipboard-20261006-000000-000.png')
    const other = join(dir, 'notes.png')
    for (const f of [old, recent, other]) writeFileSync(f, 'x')
    const eightDaysAgo = (now.getTime() - 8 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(old, eightDaysAgo, eightDaysAgo)
    utimesSync(other, eightDaysAgo, eightDaysAgo)
    savePastedImage(Buffer.from('new'), dir, now)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
    expect(existsSync(other)).toBe(true)
  })
})
