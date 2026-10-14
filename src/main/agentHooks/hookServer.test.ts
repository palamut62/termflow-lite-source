import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { AgentHookServer } from './hookServer'
import type { AgentHookEvent } from '../../shared/agentHooks'

function post(url: string, body: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end(body)
  })
}

describe('AgentHookServer', () => {
  let server: AgentHookServer | null = null
  afterEach(() => server?.stop())

  async function start(): Promise<{ url: string; token: string; events: [string, AgentHookEvent][] }> {
    const file = join(mkdtempSync(join(tmpdir(), 'tf-hooks-')), 'claude-settings.json')
    const events: [string, AgentHookEvent][] = []
    server = new AgentHookServer(file, (tabId, event) => events.push([tabId, event]))
    await server.start()
    const settings = JSON.parse(readFileSync(file, 'utf8'))
    return { url: settings.hooks.Stop[0].hooks[0].url, token: server.current()!.token, events }
  }

  it('accepts a Stop hook from a known token and forwards it to the tab', async () => {
    const { url, token, events } = await start()
    const status = await post(url, JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: 'done' }), { 'x-termflow-token': token, 'x-termflow-tab': 'tab_1' })
    expect(status).toBe(204)
    expect(events).toEqual([['tab_1', { state: 'done', detail: 'done' }]])
  })

  it('rejects a wrong token, a bad tab id and malformed JSON', async () => {
    const { url, token, events } = await start()
    expect(await post(url, '{}', { 'x-termflow-token': 'x'.repeat(64), 'x-termflow-tab': 'tab_1' })).toBe(403)
    expect(await post(url, '{}', { 'x-termflow-token': token, 'x-termflow-tab': '../x' })).toBe(400)
    expect(await post(url, '{', { 'x-termflow-token': token, 'x-termflow-tab': 'tab_1' })).toBe(400)
    expect(events).toEqual([])
  })

  it('rejects requests whose Host is not loopback', async () => {
    const { url, token } = await start()
    expect(await post(url, '{}', { host: 'evil.example:80', 'x-termflow-token': token, 'x-termflow-tab': 'tab_1' })).toBe(403)
  })

  it('never writes the token into the settings file', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tf-hooks-')), 'claude-settings.json')
    server = new AgentHookServer(file, () => undefined)
    await server.start()
    expect(readFileSync(file, 'utf8')).not.toContain(server.current()!.token)
  })
})
