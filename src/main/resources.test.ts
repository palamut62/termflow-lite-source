import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppMetrics: () => [] } }))
const { descendants, parseNetstat, parsePsProcesses, parseSs, parseWinProcesses } = await import('./resources')

describe('process table parsers', () => {
  it('reads Win32_Process and ps rows', () => {
    expect(parseWinProcesses('4,0,1024,20000000\r\nbad line\r\n')).toEqual([{ pid: 4, ppid: 0, memory: 1024, cpuSeconds: 2 }])
    expect(parsePsProcesses('  10     1  2048   3\n')).toEqual([{ pid: 10, ppid: 1, memory: 2048 * 1024, cpuSeconds: 3 }])
  })

  it('walks a process tree without looping on a pid cycle', () => {
    const rows = [{ pid: 1, ppid: 0 }, { pid: 2, ppid: 1 }, { pid: 3, ppid: 2 }, { pid: 9, ppid: 8 }, { pid: 1, ppid: 3 }].map((r) => ({ ...r, memory: 0, cpuSeconds: 0 }))
    expect([...descendants(rows, 1)].sort()).toEqual([1, 2, 3])
  })
})

it('reads listening TCP ports from netstat and ss', () => {
  const netstat = '  Proto  Local Address  Foreign Address  State  PID\r\n  TCP    0.0.0.0:3000   0.0.0.0:0   LISTENING   4242\r\n  TCP    127.0.0.1:52000   127.0.0.1:3000   ESTABLISHED   1\r\n  TCP    [::]:5173   [::]:0   LISTENING   77\r\n'
  expect(parseNetstat(netstat)).toEqual([{ address: '0.0.0.0', port: 3000, pid: 4242 }, { address: '[::]', port: 5173, pid: 77 }])
  expect(parseSs('LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1234,fd=20))\n')).toEqual([{ address: '0.0.0.0', port: 3000, pid: 1234 }])
})
