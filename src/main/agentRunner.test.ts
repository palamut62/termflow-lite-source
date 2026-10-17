import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { headlessCommand, isDelegateAgent, parseAgentOutput, taskBranch } from './agentRunner'

const WT = join('/repo', '.termflow-worktrees', 'app', 'deleg-x')

describe('headlessCommand', () => {
  it('builds the verified OpenCode command with an optional model', () => {
    expect(headlessCommand('opencode', 'fix it', WT, 'opencode/glm-5.3-flash-free')).toEqual({
      command: 'opencode',
      args: ['run', '--dir', WT, '-m', 'opencode/glm-5.3-flash-free', '--auto', '--format', 'json', 'fix it']
    })
    expect(headlessCommand('opencode', 'fix it', WT).args).toEqual(['run', '--dir', WT, '--auto', '--format', 'json', 'fix it'])
  })

  it('always names the worktree explicitly (OpenCode ignored the spawn cwd)', () => {
    const codex = headlessCommand('codex', 'x', WT).args
    expect(codex[codex.indexOf('-C') + 1]).toBe(WT)
    expect(codex[codex.indexOf('-o') + 1]).toBe(join(WT, '.termflow-last-message.txt'))
    const grok = headlessCommand('grok', 'x', WT).args
    expect(grok[grok.indexOf('--cwd') + 1]).toBe(WT)
  })

  it('builds Codex and Grok commands with full permissions for the throwaway worktree', () => {
    const codex = headlessCommand('codex', 'x', WT, 'gpt-5')
    expect(codex.args.slice(0, 4)).toEqual(['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--json'])
    expect(codex.args).toContain('-o')
    expect(codex.args.slice(-3)).toEqual(['-m', 'gpt-5', 'x'])
    expect(headlessCommand('grok', 'x', WT).args).toEqual(['-p', 'x', '--always-approve', '--output-format', 'json', '--cwd', WT])
  })

  it('keeps a multi-line prompt with quotes as one argument', () => {
    const prompt = 'line "one"\nline \'two\' & | > %PATH%'
    expect(headlessCommand('opencode', prompt, WT).args.at(-1)).toBe(prompt)
  })

  it('never lets a prompt be parsed as a flag', () => {
    expect(headlessCommand('opencode', '--help', WT).args.at(-1)).toBe('Task: --help')
    expect(headlessCommand('grok', ' -rf', WT).args[1]).toBe('Task:  -rf')
  })

  it('ignores a blank model', () => {
    expect(headlessCommand('grok', 'x', WT, '  ').args).not.toContain('-m')
  })
})

describe('parseAgentOutput', () => {
  it('reads the last text, summed cost and tokens from OpenCode events', () => {
    const stdout = [
      '{"type":"step_start","part":{"type":"step-start"}}',
      '{"type":"text","part":{"type":"text","text":"first"}}',
      '{"type":"step_finish","part":{"type":"step-finish","cost":0.01,"tokens":{"total":100}}}',
      'not json',
      '{"type":"text","part":{"type":"text","text":"tamam"}}',
      '{"type":"step_finish","part":{"type":"step-finish","cost":0.02,"tokens":{"total":50}}}'
    ].join('\n')
    const out = parseAgentOutput('opencode', stdout)
    expect(out.lastMessage).toBe('tamam')
    expect(out.cost).toBeCloseTo(0.03)
    expect(out.tokens).toBe(150)
    expect(out.error).toBeUndefined()
  })

  it('surfaces an OpenCode provider error (402 balance)', () => {
    const stdout = '{"type":"error","error":{"name":"APIError","data":{"message":"Insufficient Balance","statusCode":402}}}'
    expect(parseAgentOutput('opencode', stdout).error).toBe('Insufficient Balance')
  })

  it('takes the Codex message from the last-message file and reports failed turns', () => {
    expect(parseAgentOutput('codex', '{"type":"turn.completed"}', ' done \n').lastMessage).toBe('done')
    expect(parseAgentOutput('codex', '{"type":"turn.failed","error":{"message":"quota"}}').error).toBe('quota')
  })

  it('reads the Grok JSON object and treats a non end_turn stop as an error', () => {
    const ok = '{\n  "text": "ok",\n  "stopReason": "end_turn"\n}'
    expect(parseAgentOutput('grok', ok)).toEqual({ lastMessage: 'ok' })
    const cancelled = 'warning\n{\n  "text": "half",\n  "stopReason": "cancelled"\n}'
    expect(parseAgentOutput('grok', cancelled).error).toBe('Agent stopped: cancelled')
    expect(parseAgentOutput('grok', 'garbage').error).toBe('Unreadable agent output')
  })
})

describe('helpers', () => {
  it('names the task branch and validates agent ids', () => {
    expect(taskBranch('ab12')).toBe('deleg/ab12')
    expect(isDelegateAgent('opencode')).toBe(true)
    expect(isDelegateAgent('gemini')).toBe(false)
  })
})
