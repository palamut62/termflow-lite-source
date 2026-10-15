// Agent IDE Resource Manager + Ports (PRD 4.9): per-terminal process tree memory/CPU and listening TCP ports.
// One process-table scan per call; the renderer only polls while one of those popovers is open.

import { execFile } from 'child_process'
import { cpus } from 'os'
import { promisify } from 'util'
import { app } from 'electron'
import type { ResourceSnapshot } from '../shared/ipc'

const execFileAsync = promisify(execFile)

export interface ProcRow { pid: number; ppid: number; memory: number; cpuSeconds: number }
export interface PortRow { port: number; address: string; pid: number }

/** `pid,ppid,workingSet,kernel+user (100 ns)` lines from Win32_Process. */
export function parseWinProcesses(stdout: string): ProcRow[] {
  return stdout.split(/\r?\n/).map((line) => line.trim().split(',').map(Number)).filter((p) => p.length === 4 && p.every(Number.isFinite))
    .map(([pid, ppid, memory, cpu]) => ({ pid, ppid, memory, cpuSeconds: cpu / 1e7 }))
}

/** `ps -eo pid=,ppid=,rss=,times=` (rss KB, times = cumulative CPU seconds). */
export function parsePsProcesses(stdout: string): ProcRow[] {
  return stdout.split('\n').map((line) => line.trim().split(/\s+/).map(Number)).filter((p) => p.length === 4 && p.every(Number.isFinite))
    .map(([pid, ppid, rss, times]) => ({ pid, ppid, memory: rss * 1024, cpuSeconds: times }))
}

/** `netstat -ano -p TCP` / `-p TCPv6` LISTENING rows. */
export function parseNetstat(stdout: string): PortRow[] {
  const rows: PortRow[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i.exec(line)
    if (m) rows.push({ address: m[1] ?? '', port: Number(m[2]), pid: Number(m[3]) })
  }
  return rows
}

/** `ss -ltnpH`: `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1234,fd=20))`. */
export function parseSs(stdout: string): PortRow[] {
  const rows: PortRow[] = []
  for (const line of stdout.split('\n')) {
    const m = /^\S+\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+.*?pid=(\d+)/.exec(line)
    if (m) rows.push({ address: m[1] ?? '', port: Number(m[2]), pid: Number(m[3]) })
  }
  return rows
}

/** Every pid in the tree under `root` (root included); guards against pid cycles in a racy table. */
export function descendants(rows: readonly ProcRow[], root: number): Set<number> {
  const children = new Map<number, number[]>()
  for (const row of rows) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid])
  const out = new Set<number>([root])
  const stack = [root]
  while (stack.length) {
    for (const child of children.get(stack.pop() as number) ?? []) {
      if (!out.has(child)) { out.add(child); stack.push(child) }
    }
  }
  return out
}

async function processTable(): Promise<ProcRow[]> {
  if (process.platform === 'win32') {
    const script = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize),$($_.KernelModeTime + $_.UserModeTime)" }'
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
    return parseWinProcesses(stdout)
  }
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,rss=,times='], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 })
  return parsePsProcesses(stdout)
}

async function listeningPorts(): Promise<PortRow[]> {
  if (process.platform === 'win32') {
    const [v4, v6] = await Promise.all(['TCP', 'TCPv6'].map((p) => execFileAsync('netstat', ['-ano', '-p', p], { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 }).then((r) => r.stdout).catch(() => '')))
    return [...parseNetstat(v4 ?? ''), ...parseNetstat(v6 ?? '')]
  }
  const { stdout } = await execFileAsync('ss', ['-ltnpH'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
  return parseSs(stdout)
}

/** Previous CPU sample per pid, for a CPU% over the interval between two scans. */
let lastSample: { at: number; cpu: Map<number, number> } | null = null

export async function readResources(terminals: readonly { id: string; pid: number }[]): Promise<ResourceSnapshot> {
  const [rows, ports] = await Promise.all([processTable().catch(() => [] as ProcRow[]), listeningPorts().catch(() => [] as PortRow[])])
  const now = Date.now()
  const cores = Math.max(1, cpus().length)
  const previous = lastSample
  lastSample = { at: now, cpu: new Map(rows.map((r) => [r.pid, r.cpuSeconds])) }
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  const cpuOf = (pid: number): number => {
    const row = byPid.get(pid)
    const before = previous?.cpu.get(pid)
    if (!row || before === undefined || !previous || now <= previous.at) return 0
    return Math.max(0, ((row.cpuSeconds - before) / ((now - previous.at) / 1000) / cores) * 100)
  }
  const owner = new Map<number, string>()
  const perTerminal = terminals.map((t) => {
    const pids = descendants(rows, t.pid)
    for (const pid of pids) owner.set(pid, t.id)
    let memory = 0
    let cpu = 0
    for (const pid of pids) { memory += byPid.get(pid)?.memory ?? 0; cpu += cpuOf(pid) }
    return { id: t.id, memory, cpu: Math.round(cpu * 10) / 10, processes: [...pids].filter((pid) => byPid.has(pid)).length }
  })
  const metrics = app.getAppMetrics()
  const seen = new Set<string>()
  return {
    app: {
      memory: metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0) * 1024, 0),
      cpu: Math.round(metrics.reduce((sum, m) => sum + (m.cpu?.percentCPUUsage ?? 0), 0) * 10) / 10
    },
    terminals: perTerminal,
    // Ayni port IPv4 ve IPv6'da iki kez dinlenir; bir kez listelenir.
    ports: ports.filter((p) => !seen.has(`${p.port}:${p.pid}`) && seen.add(`${p.port}:${p.pid}`))
      .map((p) => ({ port: p.port, address: p.address, pid: p.pid, terminalId: owner.get(p.pid) }))
      .sort((a, b) => a.port - b.port)
  }
}

/** Ucuz: yalniz Electron surecleri (durum cubugu etiketi). */
export function appMemory(): number {
  return app.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0) * 1024, 0)
}
