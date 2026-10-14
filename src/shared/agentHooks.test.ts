import { describe, expect, it } from 'vitest'
import { agentHookArgs, claudeHookEvent, claudeHookSettings, codexOscEvent, codexTitleWorking, hookActivity, summaryLine } from './agentHooks'

const sid = '72c55b04-b73a-427f-8f45-0ab6dab9fc2b'

describe('claudeHookEvent', () => {
  it('maps the real Stop payload to done with a short summary', () => {
    // Claude Code 2.1.289'dan yakalanan gercek govde (2026-10-14).
    const stop = { session_id: sid, transcript_path: 'C:\\x.jsonl', cwd: 'C:\\tmp', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: '## Done\nFixed the bug.' }
    expect(claudeHookEvent(stop)).toEqual({ sessionId: sid, state: 'done', detail: 'Done' })
  })

  it('maps turn start, tool use, permission and failure', () => {
    expect(claudeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: sid })?.state).toBe('working')
    expect(claudeHookEvent({ hook_event_name: 'PostToolUse' })?.state).toBe('working')
    expect(claudeHookEvent({ hook_event_name: 'PermissionRequest', tool_name: 'Bash' })).toEqual({ state: 'needs-input', detail: 'Approve Bash' })
    expect(claudeHookEvent({ hook_event_name: 'StopFailure' })?.state).toBe('error')
  })

  it('drops unsafe session ids and SessionStart (no http support)', () => {
    expect(claudeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: '../../etc' })).toEqual({ state: 'working' })
    expect(claudeHookEvent({ hook_event_name: 'SessionStart', session_id: sid })).toBeNull()
  })

  it('treats only attention notifications as needs-input', () => {
    expect(claudeHookEvent({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission' })?.state).toBe('needs-input')
    expect(claudeHookEvent({ hook_event_name: 'Notification', notification_type: 'idle_prompt' })).toBeNull()
    expect(claudeHookEvent({ hook_event_name: 'PreCompact' })).toBeNull()
    expect(claudeHookEvent('nope')).toBeNull()
  })

  it('masks keys in summaries', () => {
    expect(summaryLine('used sk-ant-abcdefghijklmnopqrstuvwxyz123456 here')).not.toContain('abcdefghijkl')
  })
})

describe('codex signals', () => {
  it('splits OSC 9 into approval and turn complete', () => {
    // Codex 0.162.1'den yakalanan gercek metinler (2026-10-14).
    expect(codexOscEvent('Approval requested: "C:\\Windows\\System32\\Win...').state).toBe('needs-input')
    expect(codexOscEvent('ok')).toEqual({ state: 'done', detail: 'ok' })
  })

  it('reads the braille spinner in the window title as working', () => {
    expect(codexTitleWorking('⠴ Run shell probe | termflow-lite')).toBe(true)
    expect(codexTitleWorking('Run shell probe | termflow-lite')).toBe(false)
  })
})

describe('launch', () => {
  it('adds the settings file to claude once and OSC 9 config to codex', () => {
    expect(agentHookArgs('claude', ['--resume', sid], 'C:\\a b\\s.json')).toEqual(['--settings', 'C:\\a b\\s.json'])
    expect(agentHookArgs('claude', ['--settings', 'mine.json'], 'x')).toEqual([])
    expect(agentHookArgs('codex', [], 'x')).toContain('tui.notification_method=osc9')
    expect(agentHookArgs('opencode', [], 'x')).toEqual([])
  })

  it('writes http hooks that take secrets only from env', () => {
    const settings = claudeHookSettings('http://127.0.0.1:5000/claude')
    expect(Object.keys(settings.hooks)).toContain('PermissionRequest')
    expect(JSON.stringify(settings)).toContain('$TERMFLOW_HOOK_TOKEN')
  })

  it('keeps the process running flag out of activity mapping', () => {
    expect(hookActivity('working')).toBe('running')
    expect(hookActivity('needs-input')).toBe('waiting')
    expect(hookActivity('done')).toBe('completed')
  })
})
