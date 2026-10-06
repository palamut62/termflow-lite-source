import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connect, connectionStatus, disconnect, installServerScript, serverLaunch, type ConnectDeps } from './connect'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'termflow-connect-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const launch = serverLaunch('C:\\Apps\\TermFlow Lite.exe', 'C:\\data\\mcp\\memory-server.cjs', 'C:\\data\\memory')

function deps(overrides: Partial<ConnectDeps> = {}): ConnectDeps & { run: ReturnType<typeof vi.fn> } {
  const home = tempDir()
  return { run: vi.fn(async () => ''), home, opencodeConfigDir: join(home, '.config', 'opencode'), ...overrides } as ConnectDeps & { run: ReturnType<typeof vi.fn> }
}

describe('agent connections', () => {
  it('registers with Claude through its own CLI at user scope', async () => {
    const d = deps()
    d.run.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'mcp' && args[1] === 'add') {
        writeFileSync(join(d.home, '.claude.json'), JSON.stringify({ mcpServers: { 'termflow-memory': { command: launch.command, args: launch.args } } }))
      }
      return ''
    })
    const result = await connect('claude', launch, d)
    expect(result).toEqual({ agent: 'claude', state: 'connected' })
    expect(d.run).toHaveBeenCalledWith('claude', ['mcp', 'remove', '--scope', 'user', 'termflow-memory'])
    expect(d.run).toHaveBeenCalledWith('claude', ['mcp', 'add', '--scope', 'user', 'termflow-memory', '-e', 'ELECTRON_RUN_AS_NODE=1', '--', launch.command, ...launch.args])
  })

  it('reports Claude as outdated when registered with another app path, and missing without the CLI', async () => {
    const d = deps()
    writeFileSync(join(d.home, '.claude.json'), JSON.stringify({ mcpServers: { 'termflow-memory': { command: 'C:\\old\\TermFlow Lite.exe', args: launch.args } } }))
    expect(await connectionStatus('claude', launch, d)).toEqual({ agent: 'claude', state: 'outdated' })
    writeFileSync(join(d.home, '.claude.json'), JSON.stringify({}))
    expect(await connectionStatus('claude', launch, d)).toEqual({ agent: 'claude', state: 'disconnected' })
    const missing = deps({ run: vi.fn(async () => { throw new Error('CLI not found') }) })
    expect(await connectionStatus('claude', launch, missing)).toEqual({ agent: 'claude', state: 'missing' })
  })

  it('registers with Codex and reads its JSON status', async () => {
    const d = deps()
    let registered = false
    d.run.mockImplementation(async (_command: string, args: string[]) => {
      if (args[1] === 'add') registered = true
      if (args[1] === 'get') {
        if (!registered) throw new Error('not found')
        return JSON.stringify({ name: 'termflow-memory', transport: { type: 'stdio', command: launch.command, args: launch.args } })
      }
      return ''
    })
    expect(await connectionStatus('codex', launch, d)).toEqual({ agent: 'codex', state: 'disconnected' })
    expect(await connect('codex', launch, d)).toEqual({ agent: 'codex', state: 'connected' })
    expect(d.run).toHaveBeenCalledWith('codex', ['mcp', 'add', 'termflow-memory', '--env', 'ELECTRON_RUN_AS_NODE=1', '--', launch.command, ...launch.args])
    await disconnect('codex', d)
    expect(d.run).toHaveBeenCalledWith('codex', ['mcp', 'remove', 'termflow-memory'])
  })

  it('edits opencode.json with a backup and keeps other servers', async () => {
    const d = deps()
    mkdirSync(d.opencodeConfigDir, { recursive: true })
    const file = join(d.opencodeConfigDir, 'opencode.json')
    writeFileSync(file, JSON.stringify({ $schema: 'x', mcp: { pencil: { type: 'local', command: ['pen'] } } }))
    expect(await connect('opencode', launch, d)).toEqual({ agent: 'opencode', state: 'connected' })
    const config = JSON.parse(readFileSync(file, 'utf8'))
    expect(config.mcp.pencil).toEqual({ type: 'local', command: ['pen'] })
    expect(config.mcp['termflow-memory']).toEqual({ type: 'local', command: [launch.command, ...launch.args], environment: { ELECTRON_RUN_AS_NODE: '1' }, enabled: true })
    expect(existsSync(`${file}.termflow-backup`)).toBe(true)
    await disconnect('opencode', d)
    expect(JSON.parse(readFileSync(file, 'utf8')).mcp).toEqual({ pencil: { type: 'local', command: ['pen'] } })
    expect(await connectionStatus('opencode', launch, d)).toEqual({ agent: 'opencode', state: 'disconnected' })
  })

  it('creates opencode.json when missing and refuses to rewrite an unparsable one', async () => {
    const d = deps()
    expect(await connect('opencode', launch, d)).toEqual({ agent: 'opencode', state: 'connected' })
    writeFileSync(join(d.opencodeConfigDir, 'opencode.json'), '{ // comment\n}')
    expect(await connect('opencode', launch, d)).toMatchObject({ agent: 'opencode', state: 'error' })
  })

  it('surfaces CLI errors from registration', async () => {
    const d = deps()
    d.run.mockImplementation(async (_command: string, args: string[]) => {
      if (args[1] === 'add') throw Object.assign(new Error('failed'), { stderr: 'permission denied\nmore' })
      return ''
    })
    expect(await connect('claude', launch, d)).toEqual({ agent: 'claude', state: 'error', detail: 'permission denied' })
  })

  it('installs the server script only when it changed', () => {
    const source = join(tempDir(), 'memory-server.cjs')
    const target = tempDir()
    writeFileSync(source, 'v1')
    const path = installServerScript(source, join(target, 'mcp'))
    expect(readFileSync(path, 'utf8')).toBe('v1')
    writeFileSync(source, 'v2')
    expect(readFileSync(installServerScript(source, join(target, 'mcp')), 'utf8')).toBe('v2')
  })
})
