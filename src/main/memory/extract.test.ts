import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DigestBuilder, cleanUserText, commitMessage, digestFromJsonl, digestFromOpenCodeExport,
  isMeaningful, renderDigest
} from './extract'

const dirs: string[] = []
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))))

async function fixture(name: string, lines: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'termflow-memory-'))
  dirs.push(dir)
  const file = join(dir, name)
  await writeFile(file, lines.map((line) => JSON.stringify(line)).join('\n'), 'utf8')
  return file
}

const cwd = 'C:\\work\\app'
const claudeUser = (content: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ type: 'user', sessionId: 's1', cwd, timestamp: '2026-10-01T10:00:00Z', message: { role: 'user', content }, ...extra })
const claudeAssistant = (content: unknown[], timestamp = '2026-10-01T10:05:00Z'): Record<string, unknown> =>
  ({ type: 'assistant', sessionId: 's1', cwd, timestamp, message: { role: 'assistant', content } })
const toolUse = (id: string, name: string, input: Record<string, unknown>): Record<string, unknown> => ({ type: 'tool_use', id, name, input })
const toolResult = (id: string, content: string, isError = false, toolUseResult?: unknown): Record<string, unknown> =>
  claudeUser([{ type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }], toolUseResult ? { toolUseResult } : {})

describe('Claude transcript digest', () => {
  it('keeps real requests, files, tasks, commits, checks and errors; drops tool output', async () => {
    const file = await fixture('s1.jsonl', [
      { type: 'queue-operation', operation: 'enqueue', sessionId: 's1' },
      claudeUser('Add a memory panel to the app'),
      claudeUser('<command-name>/model</command-name>'),
      claudeUser([{ type: 'text', text: 'Continue from where you left off.' }], { isMeta: true }),
      claudeAssistant([
        { type: 'thinking', thinking: 'secret reasoning' },
        { type: 'text', text: 'Looking at the code.' },
        toolUse('t1', 'TaskCreate', { subject: 'Write extractor', description: 'x' }),
        toolUse('t2', 'TaskCreate', { subject: 'Write store' })
      ]),
      toolResult('t1', 'Task #1 created successfully: Write extractor', false, { task: { id: '1', subject: 'Write extractor' } }),
      toolResult('t2', 'Task #2 created successfully: Write store'),
      claudeAssistant([
        toolUse('e1', 'Edit', { file_path: 'C:\\work\\app\\src\\extract.ts', old_string: 'a', new_string: 'b' }),
        toolUse('w1', 'Write', { file_path: 'C:\\work\\app\\src\\new.ts', content: 'FILE CONTENT' }),
        toolUse('b1', 'Bash', { command: 'npm run verify' }),
        toolUse('b2', 'Bash', { command: 'git commit -m "memory: extractor ekle"' }),
        toolUse('b3', 'Bash', { command: 'npm test -- extract' }),
        toolUse('r1', 'Read', { file_path: 'C:\\work\\app\\missing.ts' }),
        toolUse('u1', 'TaskUpdate', { taskId: '1', status: 'completed' }),
        toolUse('u2', 'TaskUpdate', { taskId: '2', status: 'in_progress' })
      ]),
      toolResult('b1', 'TOOL OUTPUT SHOULD NOT LEAK'),
      toolResult('b2', '[main abc123] memory: extractor ekle'),
      toolResult('b3', 'Exit code 1\nFAIL extract.test.ts', true),
      toolResult('r1', 'File does not exist.', true),
      claudeAssistant([{ type: 'text', text: 'Extractor done, store is next.' }], '2026-10-01T11:00:00Z'),
      { type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent noise' }] } }
    ])
    const digest = await digestFromJsonl(file, 'claude')

    expect(digest.id).toBe('s1')
    expect(digest.cwd).toBe(cwd)
    expect(digest.userMessages).toEqual(['Add a memory panel to the app'])
    expect(digest.assistantMessages.at(-1)).toBe('Extractor done, store is next.')
    expect(digest.files).toEqual(['src/extract.ts', 'src/new.ts (new)'])
    expect(digest.tasks).toEqual([
      { text: 'Write extractor', status: 'completed' },
      { text: 'Write store', status: 'in_progress' }
    ])
    expect(digest.commits).toEqual(['memory: extractor ekle'])
    expect(digest.checks).toEqual([
      { command: 'npm run verify', ok: true },
      { command: 'npm test -- extract', ok: false }
    ])
    expect(digest.errors).toEqual(['npm test -- extract: Exit code 1'])
    expect(digest.interrupted).toBe(false)
    expect(digest.startedAt).toBe(Date.parse('2026-10-01T10:00:00Z'))
    expect(digest.updatedAt).toBe(Date.parse('2026-10-01T11:00:00Z'))

    const text = renderDigest(digest)
    expect(text).not.toMatch(/TOOL OUTPUT|FILE CONTENT|secret reasoning|subagent noise|Continue from where/)
    expect(text).toContain('[x] Write extractor')
    expect(text).toContain('[~] Write store')
  })

  it('reads TodoWrite lists and marks an unanswered last request as interrupted', async () => {
    const file = await fixture('s2.jsonl', [
      claudeUser('Fix login'),
      claudeAssistant([toolUse('t', 'TodoWrite', { todos: [
        { content: 'Reproduce', status: 'completed', activeForm: 'x' },
        { content: 'Patch', status: 'pending', activeForm: 'y' }
      ] })]),
      claudeAssistant([{ type: 'text', text: 'Reproduced.' }]),
      claudeUser([{ type: 'text', text: '[Request interrupted by user]' }]),
      claudeUser('also check signup')
    ])
    const digest = await digestFromJsonl(file, 'claude')
    expect(digest.tasks.map((task) => task.status)).toEqual(['completed', 'pending'])
    expect(digest.userMessages).toEqual(['Fix login', 'also check signup'])
    expect(digest.interrupted).toBe(true)
  })

  it('removes deleted tasks and ignores failed task creation', () => {
    const builder = new DigestBuilder('claude')
    builder.feedClaude(claudeAssistant([toolUse('a', 'TaskCreate', { subject: 'Keep' }), toolUse('b', 'TaskCreate', { subject: 'Drop' }), toolUse('c', 'TaskCreate', { subject: 'Broken' })]))
    builder.feedClaude(toolResult('a', 'Task #1 created successfully'))
    builder.feedClaude(toolResult('b', 'Task #2 created successfully'))
    builder.feedClaude(toolResult('c', 'error', true))
    builder.feedClaude(claudeAssistant([toolUse('d', 'TaskUpdate', { taskId: '2', status: 'deleted' }), toolUse('e', 'TaskUpdate', { taskId: '1', status: 'in_progress', subject: 'Keep it' })]))
    expect(builder.finish().tasks).toEqual([{ text: 'Keep it', status: 'in_progress' }])
  })
})

const codexEvent = (item: Record<string, unknown>): Record<string, unknown> =>
  ({ timestamp: '2026-10-02T08:00:00Z', type: 'event_msg', payload: { type: 'item_completed', item } })

describe('Codex transcript digest', () => {
  it('uses typed item_completed events and ignores duplicate response_items', async () => {
    const file = await fixture('rollout.jsonl', [
      { timestamp: '2026-10-02T07:59:00Z', type: 'session_meta', payload: { id: 'c1', cwd: 'C:\\repo', timestamp: '2026-10-02T07:59:00Z' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions\n<INSTRUCTIONS>' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Build the toolbar' }] } },
      codexEvent({ type: 'UserMessage', content: [{ type: 'text', text: '# Files mentioned by the user:\n\n## a.png: C:/tmp/a.png\n\n## My request for Codex:\n\nBuild the toolbar&#x20;\n' }] }),
      codexEvent({ type: 'AgentMessage', phase: 'commentary', content: [{ type: 'Text', text: 'Looking around' }] }),
      codexEvent({ type: 'CommandExecution', command: ['pwsh.exe', '-Command', 'npm run build'], exit_code: 0, status: 'completed', stderr: '', aggregated_output: 'LOTS OF OUTPUT' }),
      codexEvent({ type: 'CommandExecution', command: ['pwsh.exe', '-Command', 'npx tsc --noEmit'], exit_code: 1, status: 'failed', stderr: '', aggregated_output: 'line\nsrc/a.ts(3,1): error TS2304' }),
      codexEvent({ type: 'FileChange', changes: {
        'C:\\repo\\src\\toolbar.tsx': { type: 'update', unified_diff: '@@ DIFF @@' },
        'C:\\repo\\src\\icons.ts': { type: 'add' },
        'C:\\repo\\old.ts': { type: 'delete' }
      } }),
      codexEvent({ type: 'AgentMessage', phase: 'final_answer', content: [{ type: 'Text', text: 'Toolbar ready.' }] }),
      { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'Toolbar ready.' } }
    ])
    const digest = await digestFromJsonl(file, 'codex')
    expect(digest.id).toBe('c1')
    expect(digest.cwd).toBe('C:\\repo')
    expect(digest.userMessages).toEqual(['Build the toolbar'])
    expect(digest.assistantMessages).toEqual(['Toolbar ready.'])
    expect(digest.files).toEqual(['src/toolbar.tsx', 'src/icons.ts (new)', 'old.ts (deleted)'])
    expect(digest.checks).toEqual([{ command: 'npm run build', ok: true }, { command: 'npx tsc --noEmit', ok: false }])
    expect(digest.errors).toEqual(['npx tsc --noEmit: src/a.ts(3,1): error TS2304'])
    expect(digest.interrupted).toBe(false)
    expect(renderDigest(digest)).not.toMatch(/LOTS OF OUTPUT|DIFF/)
  })

  it('marks aborted turns as interrupted', () => {
    const builder = new DigestBuilder('codex')
    builder.feedCodex(codexEvent({ type: 'UserMessage', content: [{ type: 'text', text: 'Deploy it' }] }))
    builder.feedCodex(codexEvent({ type: 'AgentMessage', phase: 'final_answer', content: [{ type: 'Text', text: 'Deploying' }] }))
    builder.feedCodex({ type: 'event_msg', payload: { type: 'turn_aborted', reason: 'interrupted' } })
    expect(builder.finish().interrupted).toBe(true)
  })

  it('falls back to response_items for older Codex versions', async () => {
    const file = await fixture('old.jsonl', [
      { type: 'session_meta', payload: { id: 'old', cwd: '/home/u/repo' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>x</environment_context>' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Port the parser' }] } },
      { type: 'response_item', payload: { type: 'function_call', name: 'update_plan', arguments: JSON.stringify({ plan: [{ step: 'Read parser', status: 'completed' }, { step: 'Port', status: 'in_progress' }] }) } },
      { type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: /home/u/repo/src/parse.rs\n@@\n*** Add File: src/lex.rs\n*** End Patch' } },
      { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', 'git commit -m "port parser"'] }) } },
      { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Parser ported.' }] } }
    ])
    const digest = await digestFromJsonl(file, 'codex')
    expect(digest.userMessages).toEqual(['Port the parser'])
    expect(digest.tasks).toEqual([{ text: 'Read parser', status: 'completed' }, { text: 'Port', status: 'in_progress' }])
    expect(digest.files).toEqual(['src/parse.rs', 'src/lex.rs (new)'])
    expect(digest.commits).toEqual(['port parser'])
    expect(digest.assistantMessages).toEqual(['Parser ported.'])
  })
})

describe('OpenCode export digest', () => {
  it('reads messages, tools, todos and skips compaction summaries', () => {
    const digest = digestFromOpenCodeExport({
      info: { id: 'ses_1', directory: '/repo', time: { created: 1_790_000_000_000, updated: 1_790_000_600_000 } },
      messages: [
        { info: { role: 'user', time: { created: 1_790_000_000_000 } }, parts: [{ type: 'text', text: 'Add dark mode' }] },
        { info: { role: 'assistant', time: { created: 1_790_000_100_000 } }, parts: [
          { type: 'tool', tool: 'todowrite', state: { status: 'completed', input: { todos: [{ content: 'Theme tokens', status: 'completed' }, { content: 'Toggle', status: 'pending' }, { content: 'Old idea', status: 'cancelled' }] } } },
          { type: 'tool', tool: 'edit', state: { status: 'completed', input: { filePath: '/repo/src/theme.css' }, output: 'OUTPUT' } },
          { type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'pnpm test' }, metadata: { exit: 1 } } },
          { type: 'text', text: 'Tokens done.' }
        ] },
        { info: { role: 'assistant', summary: true, mode: 'compaction' }, parts: [{ type: 'text', text: 'COMPACTION SUMMARY' }] }
      ]
    })
    expect(digest.id).toBe('ses_1')
    expect(digest.userMessages).toEqual(['Add dark mode'])
    expect(digest.assistantMessages).toEqual(['Tokens done.'])
    expect(digest.tasks).toEqual([{ text: 'Theme tokens', status: 'completed' }, { text: 'Toggle', status: 'pending' }])
    expect(digest.files).toEqual(['src/theme.css'])
    expect(digest.checks).toEqual([{ command: 'pnpm test', ok: false }])
    expect(digest.updatedAt).toBe(1_790_000_600_000)
  })

  it('returns an empty digest for invalid exports', () => {
    expect(digestFromOpenCodeExport(null).userMessages).toEqual([])
    expect(digestFromOpenCodeExport({ info: {} }).id).toBe('')
  })
})

describe('helpers', () => {
  it('extracts commit subjects from -m and heredoc forms', () => {
    expect(commitMessage('git add . && git commit -m "fix: x"')).toBe('fix: x')
    expect(commitMessage("git commit -m 'single'")).toBe('single')
    expect(commitMessage('git commit -m "$(cat <<\'EOF\'\nsubject line\n\nbody\nEOF\n)"')).toBe('subject line')
    expect(commitMessage('git status')).toBeUndefined()
    expect(commitMessage('git commit --amend --no-edit')).toBeUndefined()
  })

  it('strips injected context from user text', () => {
    expect(cleanUserText('hi <system-reminder>noise</system-reminder> there')).toBe('hi there')
    expect(cleanUserText('<in-app-browser-context source="x">page</in-app-browser-context>\nfix button')).toBe('fix button')
  })

  it('redacts keys and enforces the size budget', () => {
    const builder = new DigestBuilder('claude', 'big')
    builder.addUser('First goal message')
    for (let index = 0; index < 150; index++) builder.addUser(`message ${index} ${'x'.repeat(200)}`)
    builder.addUser('use key sk-or-v1-abcdefghijklmnopqrstuvwxyz123456')
    const text = renderDigest(builder.finish())
    expect(text.length).toBeLessThanOrEqual(10_000)
    expect(text).toContain('1. First goal message')
    expect(text).toMatch(/messages omitted/)
    expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz123456')
  })

  it('treats greetings as not meaningful', () => {
    const greeting = new DigestBuilder('opencode')
    greeting.addUser('selam')
    expect(isMeaningful(greeting.finish())).toBe(false)
    const work = new DigestBuilder('claude')
    work.touchFile('/a.ts')
    expect(isMeaningful(work.finish())).toBe(true)
  })
})
