import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryMcpServer, serveStdio } from './mcpServer'
import { projectKey } from './projectKey'
import { MemoryStore } from './store'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'termflow-mcp-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function seeded(): { server: MemoryMcpServer; project: string } {
  const memoryDir = tempDir()
  const project = tempDir()
  const store = new MemoryStore(memoryDir)
  const key = projectKey(project)
  store.writeProject(key, `---\nproject: ${project}\nkey: ${key}\ngeneratedAt: 2026-10-06T12:00:00.000Z\nlastSessionAt: 2026-10-06T11:00:00.000Z\nsessions: 3\n---\n## Status\nLogin works\n## Unfinished\n- Password reset email\n`)
  store.writeIndex(Date.parse('2026-10-06T12:00:00Z'))
  return { server: new MemoryMcpServer(memoryDir, project), project }
}

const textOf = (response: Record<string, unknown> | null): string =>
  ((response?.result as { content: Array<{ text: string }> }).content[0].text)

describe('MemoryMcpServer', () => {
  it('negotiates the protocol and advertises read-only tools with instructions', () => {
    const { server } = seeded()
    const init = server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'termflow-memory' } } })
    expect((init!.result as { instructions: string }).instructions).toContain('get_project_memory')
    expect(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect(server.handle({ jsonrpc: '2.0', id: 2, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 2, result: {} })
    const tools = (server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })!.result as { tools: Array<{ name: string }> }).tools
    expect(tools.map((tool) => tool.name)).toEqual(['get_project_memory', 'list_projects', 'search_memory'])
    expect(server.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' })).toMatchObject({ error: { code: -32601 } })
  })

  it('returns project memory for the cwd, the index and search hits', () => {
    const { server, project } = seeded()
    const memory = textOf(server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_project_memory', arguments: { cwd: project } } }))
    expect(memory).toContain('from 3 sessions')
    expect(memory).toContain('- Password reset email')
    expect(memory).not.toContain('generatedAt:')
    expect(textOf(server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_project_memory', arguments: {} } }))).toContain('Login works')
    expect(textOf(server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_projects' } }))).toContain('Login works')
    expect(textOf(server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_memory', arguments: { query: 'PASSWORD' } } }))).toContain('- Password reset email')
    expect(textOf(server.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'search_memory', arguments: { query: 'nothing here' } } }))).toContain('No memory line')
  })

  it('explains missing memory and rejects bad tool calls', () => {
    const empty = new MemoryMcpServer(tempDir(), tempDir())
    expect(textOf(empty.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_project_memory' } }))).toContain('No memory for')
    expect(textOf(empty.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_projects' } }))).toContain('Enable Agent Memory')
    expect(empty.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } })).toMatchObject({ result: { isError: true } })
    expect(empty.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_memory', arguments: { query: ' ' } } })).toMatchObject({ result: { isError: true } })
  })

  it('speaks newline-delimited JSON-RPC over streams', async () => {
    const { server } = seeded()
    const input = new PassThrough()
    const output = new PassThrough()
    const lines: string[] = []
    output.on('data', (chunk) => lines.push(...chunk.toString().split('\n').filter(Boolean)))
    serveStdio(server, input, output)
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\nnot json\n{"jsonrpc":"2.0","id":2,')
    input.write('"method":"tools/list"}\n')
    await new Promise((resolve) => setImmediate(resolve))
    expect(lines.map((line) => JSON.parse(line))).toMatchObject([
      { id: 1, result: {} },
      { id: null, error: { code: -32700 } },
      { id: 2, result: { tools: expect.any(Array) } }
    ])
  })
})
