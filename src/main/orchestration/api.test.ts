import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { request } from 'node:http'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DelegatedTask } from '../../shared/types'
import { OrchestrationServer, type Endpoint, type OrchestrationApi } from './apiServer'
import { AgentsMcpServer, formatTask, httpClient } from './mcpServer'
import { agentsReport, isFreeModel } from './service'

const task = (patch: Partial<DelegatedTask> = {}): DelegatedTask => ({
  id: 'ab12cd34', target: 'opencode', label: 'OpenCode', model: 'opencode/glm-5.3-flash-free', prompt: 'add slugify', repoRoot: '/repo',
  status: 'done', createdAt: 1, startedAt: 1000, finishedAt: 31_000, branch: 'deleg/ab12cd34', lastMessage: 'Done.', exitCode: 0,
  diffStat: '1 file changed, 10 insertions(+)', changedFiles: ['util.js'], commit: 'f00d', worktreePath: '/wt', outputTail: 'raw',
  checkCommand: 'node check.js', check: { code: 0, timedOut: false, output: 'PASS' }, ...patch
})

describe('formatTask', () => {
  it('leads with the status and tells how to apply a finished task', () => {
    const text = formatTask(task())
    expect(text.split('\n')[0]).toBe('Task ab12cd34: DONE')
    expect(text).toContain('OpenCode (opencode/glm-5.3-flash-free) · 30 s')
    expect(text).toContain('- util.js')
    expect(text).toContain('Check "node check.js": exit 0')
    expect(text).toContain('git cherry-pick f00d')
    expect(text).not.toContain('raw')
  })

  it('shows the output tail and the fall-back rule for failures', () => {
    const text = formatTask(task({ status: 'failed', error: 'Agent made no changes', commit: undefined, changedFiles: [] }))
    expect(text).toContain('Error: Agent made no changes')
    expect(text).toContain('raw')
    expect(text).toContain('do the work yourself')
    expect(text).toContain('Nothing to apply')
  })

  it('asks to poll again while running', () => {
    expect(formatTask(task({ status: 'running', finishedAt: undefined }))).toContain('Call get_task_result again')
  })
})

describe('isFreeModel', () => {
  const priced = (id: string, price: number) => ({ id, name: id, contextLength: 0, inputPrice: price, outputPrice: price, structured: true, audio: false })
  it('counts OpenCode-hosted and -free models, not zero-priced subscription plans', () => {
    const models = [priced('opencode/glm-5.3-flash-free', 0), priced('opencode/big-pickle', 0), priced('opencode/paid', 1), priced('minimax-coding-plan/MiniMax-M2', 0)]
    expect(isFreeModel('opencode/glm-5.3-flash-free', models)).toBe(true)
    expect(isFreeModel('opencode/big-pickle', models)).toBe(true)
    expect(isFreeModel('opencode/paid', models)).toBe(false)
    expect(isFreeModel('minimax-coding-plan/MiniMax-M2', models)).toBe(false)
    expect(isFreeModel('openrouter/some-model-free', [])).toBe(true)
    expect(isFreeModel('openrouter/some-model', [])).toBe(false)
  })
})

describe('agentsReport', () => {
  const targets = [
    { id: 'opencode', label: 'OpenCode', agent: 'opencode' as const, installed: true, enabled: true, model: 'opencode/x-free', free: true },
    { id: 'codex', label: 'Codex', agent: 'codex' as const, installed: false, enabled: true, model: '', free: false },
    { id: 'provider:deepseek', label: 'DeepSeek (Claude Code)', agent: 'claude' as const, installed: true, enabled: true, model: 'v4', providerId: 'deepseek', hasCredential: false, free: false }
  ]
  const now = 1_000_000
  const usage = [{ agent: 'claude' as const, updatedAt: now, windows: [{ label: '5h', usedPercent: 82, resetsAt: now + 3600_000 }, { label: '7d', usedPercent: 30, resetsAt: now + 86_400_000 }] }]

  it('lists ready agents, unavailable ones and a threshold hint', () => {
    const text = agentsReport(targets, usage, 70, ['opencode/x-free', 'opencode/y-free'], now)
    expect(text).toContain('- opencode · OpenCode · opencode/x-free · FREE')
    expect(text).toContain('Not available: codex (not installed), provider:deepseek (no API key)')
    expect(text).toContain('Usage limits: Claude 5h 82%, 7d 30%')
    expect(text).toContain('Claude 5-hour usage is 82% (threshold 70%)')
    expect(text).toContain('to a free agent: opencode')
  })

  it('gives the generic hint under the threshold or when it is off', () => {
    expect(agentsReport(targets, usage, 90, [], now)).toContain('Hint: delegate only well-specified')
    expect(agentsReport(targets, usage, 0, [], now)).not.toContain('threshold')
    expect(agentsReport(targets, [], 70, [], now)).toContain('Usage limits: unknown')
  })
})

describe('OrchestrationServer + termflow-agents MCP', () => {
  let dir = ''
  let server: OrchestrationServer
  let endpoint: Endpoint
  let api: OrchestrationApi

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'termflow-orch-api-'))
    api = {
      agents: vi.fn(async () => ({ report: 'Agents you can delegate to: opencode' })),
      tasks: vi.fn(() => [task()]),
      submit: vi.fn(async (input) => input.prompt === 'bad' ? { error: 'prompt rejected' } : task({ status: 'queued', prompt: input.prompt })),
      wait: vi.fn(async (id) => id === 'ab12cd34' ? task() : undefined),
      diff: vi.fn(async () => '+line'),
      cancel: vi.fn((id) => id === 'ab12cd34' ? task({ status: 'cancelled' }) : undefined),
      discard: vi.fn(async () => ({ ok: true as const }))
    }
    server = new OrchestrationServer(join(dir, 'endpoint.json'), api)
    endpoint = await server.start()
  })

  afterEach(() => {
    server.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  const raw = (path: string, headers: Record<string, string>): Promise<number> => new Promise((resolve, reject) => {
    const url = new URL(endpoint.url)
    request({ host: '127.0.0.1', port: url.port, path, headers }, (res) => { res.resume(); resolve(res.statusCode ?? 0) }).on('error', reject).end()
  })

  it('writes the endpoint file and removes it on stop', () => {
    const file = join(dir, 'endpoint.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ url: endpoint.url, token: endpoint.token })
    server.stop()
    expect(existsSync(file)).toBe(false)
  })

  it('rejects a missing or wrong token and a foreign Host header', async () => {
    expect(await raw('/v1/agents', {})).toBe(403)
    expect(await raw('/v1/agents', { 'x-termflow-token': 'nope' })).toBe(403)
    expect(await raw('/v1/agents', { 'x-termflow-token': endpoint.token, host: 'evil.example:80' })).toBe(403)
    expect(await raw('/v1/agents', { 'x-termflow-token': endpoint.token })).toBe(200)
    expect(await raw('/v1/tasks/../../etc', { 'x-termflow-token': endpoint.token })).toBe(404)
  })

  it('serves every MCP tool through the API', async () => {
    const mcp = new AgentsMcpServer(httpClient(join(dir, 'endpoint.json')))
    await mcp.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { clientInfo: { name: 'claude-code' } } })
    const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError?: boolean }> => {
      const res = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as { result: { content: { text: string }[]; isError?: boolean } }
      return { text: res.result.content[0].text, isError: res.result.isError }
    }
    expect((await call('list_agents')).text).toContain('opencode')

    const started = await call('delegate_task', { agent: 'opencode', prompt: 'add slugify', cwd: '/repo', check_command: 'node check.js', timeout_s: 120 })
    expect(started.text).toContain('Task ab12cd34 queued on OpenCode')
    expect(started.text).toContain('uncommitted changes are not visible')
    expect(api.submit).toHaveBeenCalledWith({ target: 'opencode', prompt: 'add slugify', cwd: '/repo', checkCommand: 'node check.js', timeoutS: 120, model: undefined, requestedBy: 'claude-code' })
    expect(await call('delegate_task', { agent: 'opencode', prompt: 'bad', cwd: '/repo' })).toEqual({ text: 'prompt rejected', isError: true })

    const result = await call('get_task_result', { task_id: 'ab12cd34', wait_s: 999, full_diff: true })
    expect(result.text).toContain('Task ab12cd34: DONE')
    expect(result.text).toContain('Full diff:\n+line')
    expect(api.wait).toHaveBeenCalledWith('ab12cd34', 55_000)
    expect((await call('get_task_result', { task_id: 'ffff' })).isError).toBe(true)
    expect((await call('get_task_result', {})).text).toBe('task_id is required.')

    expect((await call('list_tasks')).text).toContain('- ab12cd34 done · OpenCode')
    expect((await call('cancel_task', { task_id: 'ab12cd34' })).text).toContain('CANCELLED')
    expect((await call('discard_task', { task_id: 'ab12cd34' })).text).toContain('discarded')
    expect((await call('nope')).isError).toBe(true)
  })

  it('tells the agent when TermFlow is not running', async () => {
    server.stop()
    const mcp = new AgentsMcpServer(httpClient(join(dir, 'endpoint.json')))
    const res = await mcp.callTool('list_agents', {}) as { content: { text: string }[]; isError: boolean }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('not running')
  })

  it('answers the MCP handshake with instructions and tools', async () => {
    const mcp = new AgentsMcpServer(httpClient(join(dir, 'endpoint.json')))
    const init = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) as { result: { instructions: string; serverInfo: { name: string } } }
    expect(init.result.serverInfo.name).toBe('termflow-agents')
    expect(init.result.instructions).toContain('fails twice')
    const list = await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as { result: { tools: { name: string }[] } }
    expect(list.result.tools.map((t) => t.name)).toEqual(['list_agents', 'delegate_task', 'get_task_result', 'list_tasks', 'cancel_task', 'discard_task'])
    expect(await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })
})
