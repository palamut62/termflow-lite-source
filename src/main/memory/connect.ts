import { execFile } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'
import type { MemoryAgent, MemoryConnection } from '../../shared/types'
import { cliInvocation } from '../terminal/cli'
import { SERVER_NAME } from './mcpServer'

// Ajanlara MCP sunucusunu kaydeder. Yalnızca kullanıcı "Connect" deyince çalışır.
// Claude ve Codex kendi `mcp add/remove` komutlarıyla; OpenCode'un etkileşimsiz
// komutu olmadığı için opencode.json yedeklenip `mcp` anahtarı düzenlenir.

const exec = promisify(execFile)

export interface ServerLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

export function serverLaunch(executable: string, script: string, memoryDir: string): ServerLaunch {
  return { command: executable, args: [script, '--memory-dir', memoryDir], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

export interface ConnectDeps {
  run: (command: string, args: string[]) => Promise<string>
  home: string
  opencodeConfigDir: string
}

export const defaultDeps = (): ConnectDeps => ({
  run: async (command, args) => {
    const resolved = cliInvocation(command, args)
    const { stdout } = await exec(resolved.file, resolved.args, { timeout: 30_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    return stdout
  },
  home: homedir(),
  opencodeConfigDir: join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode')
})

const samePath = (a: string, b: string): boolean => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b

function matches(launch: ServerLaunch, command: unknown, args: unknown): boolean {
  return typeof command === 'string' && samePath(command, launch.command) && Array.isArray(args) &&
    args.length === launch.args.length && args.every((arg, index) => typeof arg === 'string' && samePath(arg, launch.args[index]))
}

async function installed(deps: ConnectDeps, command: string): Promise<boolean> {
  try {
    await deps.run(command, ['--version'])
    return true
  } catch {
    return false
  }
}

function readJsonFile(file: string): Record<string, any> | null {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>
}

function writeJsonFile(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.termflow.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}

const errorText = (error: unknown): string => {
  const record = error as { stderr?: unknown; message?: unknown }
  const stderr = typeof record?.stderr === 'string' ? record.stderr.trim() : ''
  return (stderr || (error instanceof Error ? error.message : String(error))).split('\n')[0].slice(0, 200)
}

export async function connectionStatus(agent: MemoryAgent, launch: ServerLaunch, deps: ConnectDeps = defaultDeps(), name = SERVER_NAME): Promise<MemoryConnection> {
  try {
    if (agent === 'claude') {
      if (!await installed(deps, 'claude')) return { agent, state: 'missing' }
      const entry = readJsonFile(join(deps.home, '.claude.json'))?.mcpServers?.[name]
      if (!entry) return { agent, state: 'disconnected' }
      return { agent, state: matches(launch, entry.command, entry.args) ? 'connected' : 'outdated' }
    }
    if (agent === 'codex') {
      if (!await installed(deps, 'codex')) return { agent, state: 'missing' }
      let entry: Record<string, any>
      try {
        entry = JSON.parse(await deps.run('codex', ['mcp', 'get', name, '--json'])) as Record<string, any>
      } catch {
        return { agent, state: 'disconnected' }
      }
      const transport = entry.transport ?? entry
      return { agent, state: matches(launch, transport.command, transport.args) ? 'connected' : 'outdated' }
    }
    if (!await installed(deps, 'opencode')) return { agent, state: 'missing' }
    const entry = readJsonFile(join(deps.opencodeConfigDir, 'opencode.json'))?.mcp?.[name]
    if (!entry) return { agent, state: 'disconnected' }
    const [command, ...args] = Array.isArray(entry.command) ? entry.command : []
    return { agent, state: matches(launch, command, args) ? 'connected' : 'outdated' }
  } catch (error) {
    return { agent, state: 'error', detail: errorText(error) }
  }
}

export async function connect(agent: MemoryAgent, launch: ServerLaunch, deps: ConnectDeps = defaultDeps(), name = SERVER_NAME): Promise<MemoryConnection> {
  try {
    if (agent === 'opencode') {
      const file = join(deps.opencodeConfigDir, 'opencode.json')
      const config = readJsonFile(file) ?? { $schema: 'https://opencode.ai/config.json' }
      if (existsSync(file)) copyFileSync(file, `${file}.termflow-backup`)
      config.mcp = { ...(config.mcp ?? {}), [name]: { type: 'local', command: [launch.command, ...launch.args], environment: launch.env, enabled: true } }
      writeJsonFile(file, config)
    } else {
      await disconnect(agent, deps, name).catch(() => undefined)
      const env = Object.entries(launch.env).map(([key, value]) => `${key}=${value}`)
      const args = agent === 'claude'
        ? ['mcp', 'add', '--scope', 'user', name, ...env.flatMap((pair) => ['-e', pair]), '--', launch.command, ...launch.args]
        : ['mcp', 'add', name, ...env.flatMap((pair) => ['--env', pair]), '--', launch.command, ...launch.args]
      await deps.run(agent, args)
    }
  } catch (error) {
    return { agent, state: 'error', detail: errorText(error) }
  }
  return connectionStatus(agent, launch, deps, name)
}

export async function disconnect(agent: MemoryAgent, deps: ConnectDeps = defaultDeps(), name = SERVER_NAME): Promise<void> {
  if (agent === 'claude') {
    await deps.run('claude', ['mcp', 'remove', '--scope', 'user', name])
    return
  }
  if (agent === 'codex') {
    await deps.run('codex', ['mcp', 'remove', name])
    return
  }
  const file = join(deps.opencodeConfigDir, 'opencode.json')
  const config = readJsonFile(file)
  if (!config?.mcp?.[name]) return
  copyFileSync(file, `${file}.termflow-backup`)
  delete config.mcp[name]
  writeJsonFile(file, config)
}

/**
 * Sunucu betiğini sabit bir yere (userData/mcp) kopyalar: asar içinden ve
 * AppImage'ın her açılışta değişen bağlama noktasından bağımsız bir yol.
 */
export function installServerScript(source: string, targetDir: string, fileName = 'memory-server.cjs'): string {
  const target = join(targetDir, fileName)
  const content = readFileSync(source)
  let current: Buffer | null = null
  try { current = readFileSync(target) } catch { /* ilk kurulum */ }
  if (!current || !current.equals(content)) {
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(target, content)
  }
  return target
}

/** Ajanların başlatacağı uygulama dosyası. AppImage'da bağlama noktası değil, AppImage'ın kendisi. */
export function appExecutable(): string {
  return process.platform === 'linux' && process.env.APPIMAGE ? process.env.APPIMAGE : process.execPath
}
