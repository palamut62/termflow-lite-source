import { open, readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { parseClaudeRateLimits, parseCodexRateLimits, type AgentUsage } from '../../shared/usage'

/**
 * usage-meter (docs/orca-parity/usage-meter.md): yalniz yerel dosyalar; token okunmaz,
 * saglayiciya istek atilmaz.
 */
const TAIL_BYTES = 64 * 1024

/** ~/.codex/sessions/YYYY/MM/DD altindaki en yeni rollout dosyasi (klasorler adla siralanir). */
export async function newestCodexRollout(root: string): Promise<string | null> {
  let dir = root
  for (let depth = 0; depth < 3; depth++) {
    const entries = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
    if (!entries.length) return null
    dir = join(dir, entries.map((e) => e.name).sort().at(-1)!)
  }
  const files = (await readdir(dir).catch(() => [] as string[])).filter((name) => name.endsWith('.jsonl'))
  let newest: { path: string; mtime: number } | null = null
  for (const name of files) {
    const path = join(dir, name)
    const mtime = (await stat(path).catch(() => null))?.mtimeMs ?? 0
    if (!newest || mtime > newest.mtime) newest = { path, mtime }
  }
  return newest?.path ?? null
}

async function tail(file: string): Promise<string> {
  const handle = await open(file, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function readCodexUsage(root = join(homedir(), '.codex', 'sessions'), now = Date.now()): Promise<AgentUsage | null> {
  const file = await newestCodexRollout(root)
  if (!file) return null
  const lines = (await tail(file)).split('\n').filter((line) => line.includes('"rate_limits"'))
  for (let i = lines.length - 1; i >= 0; i--) {
    const usage = parseCodexRateLimits(lines[i], now)
    if (usage) return usage
  }
  return null
}

/** Claude status line sarmalayicisinin yazdigi son JSON (userData/agent-hooks/usage/claude.json). */
export async function readClaudeUsage(file: string, now = Date.now()): Promise<AgentUsage | null> {
  try {
    const usage = parseClaudeRateLimits(JSON.parse(await readFile(file, 'utf8')), now)
    return usage ? { ...usage, updatedAt: (await stat(file)).mtimeMs } : null
  } catch {
    return null
  }
}
