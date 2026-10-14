import { expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { effectiveClaudeStatusLine } from './claudeStatusLine'

const statusLine = (command: string): string => JSON.stringify({ statusLine: { type: 'command', command } })

it('uses local over project over user settings and tolerates broken files', () => {
  const home = mkdtempSync(join(tmpdir(), 'tf-home-'))
  const project = mkdtempSync(join(tmpdir(), 'tf-proj-'))
  expect(effectiveClaudeStatusLine(project, home)).toBeNull()
  mkdirSync(join(home, '.claude'))
  writeFileSync(join(home, '.claude', 'settings.json'), statusLine('python C:/Users/me/.claude/statusline.py'))
  expect(effectiveClaudeStatusLine(project, home)).toBe('python C:/Users/me/.claude/statusline.py')
  mkdirSync(join(project, '.claude'))
  writeFileSync(join(project, '.claude', 'settings.local.json'), '{broken')
  writeFileSync(join(project, '.claude', 'settings.json'), statusLine('project-line'))
  expect(effectiveClaudeStatusLine(project, home)).toBe('project-line')
  writeFileSync(join(project, '.claude', 'settings.local.json'), statusLine('local-line'))
  expect(effectiveClaudeStatusLine(project, home)).toBe('local-line')
})
