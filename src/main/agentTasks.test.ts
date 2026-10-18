import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { claudeTasksRoot, listAgentTasks } from './agentTasks'

describe('listAgentTasks', () => {
  it('lists the session task outputs newest first and ignores other sessions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tasks-'))
    const dir = join(root, 'C--proj', 'sess-1', 'tasks')
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(root, 'C--proj', 'sess-2', 'tasks'), { recursive: true })
    writeFileSync(join(dir, 'old.output'), 'a')
    writeFileSync(join(dir, 'new.output'), 'hello')
    writeFileSync(join(dir, 'note.txt'), 'x')
    writeFileSync(join(root, 'C--proj', 'sess-2', 'tasks', 'other.output'), 'x')
    utimesSync(join(dir, 'old.output'), new Date(1000), new Date(1000))
    const tasks = await listAgentTasks('sess-1', root)
    expect(tasks.map((t) => t.id)).toEqual(['new', 'old'])
    expect(tasks[0]).toMatchObject({ size: 5, path: join(dir, 'new.output') })
  })

  it('returns nothing when the folder is missing and rejects unsafe ids', async () => {
    expect(await listAgentTasks('sess-1', join(tmpdir(), 'no-such-root-xyz'))).toEqual([])
    await expect(listAgentTasks('../x', tmpdir())).rejects.toThrow()
  })

  it('honours CLAUDE_CODE_TMPDIR', () => {
    expect(claudeTasksRoot({ CLAUDE_CODE_TMPDIR: join('t') })).toBe(join('t', 'claude'))
  })
})
