// Agent IDE worktree notes (PRD F4.3): one Markdown file per worktree under userData/notes,
// never inside the project, so notes do not show up in git status.

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'

const MAX_NOTE_CHARS = 1_000_000

/** Same worktree, same file: case and slash differences on Windows do not split a note. */
export function noteFile(dir: string, worktreePath: string): string {
  const key = resolve(worktreePath).replace(/\\/g, '/').replace(/\/+$/, '')
  const normalized = process.platform === 'win32' ? key.toLowerCase() : key
  return join(dir, `${createHash('sha1').update(normalized).digest('hex').slice(0, 16)}.md`)
}

export function readNote(dir: string, worktreePath: unknown): string {
  if (typeof worktreePath !== 'string' || !isAbsolute(worktreePath)) return ''
  const file = noteFile(dir, worktreePath)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

export function writeNote(dir: string, worktreePath: unknown, text: unknown): boolean {
  if (typeof worktreePath !== 'string' || !isAbsolute(worktreePath) || typeof text !== 'string' || text.length > MAX_NOTE_CHARS) return false
  mkdirSync(dir, { recursive: true })
  const file = noteFile(dir, worktreePath)
  const temp = `${file}.tmp`
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, file)
  return true
}
