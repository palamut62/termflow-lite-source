import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type CreateTerminalInput } from '../../shared/types'
import { applyProviderSecret, TerminalManager } from './TerminalManager'

describe('applyProviderSecret', () => {
  it('injects the stored key only under the selected provider CLI variable', () => {
    const input: CreateTerminalInput = { kind: 'cmd', cols: 80, rows: 24, cwd: 'C:\\work', env: { ANTHROPIC_MODEL: 'deepseek-v4-flash' } }
    const result = applyProviderSecret(input, 'provider:deepseek', DEFAULT_SETTINGS, (id) =>
      id === 'deepseek' ? 'stored-deepseek-key' : undefined)

    expect(result.env).toEqual({
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_AUTH_TOKEN: 'stored-deepseek-key'
    })
    expect(result.secretEnvNames).toEqual(['ANTHROPIC_AUTH_TOKEN'])
    expect(input.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN')
  })

  it('does not inject credentials into non-provider terminals', () => {
    const input: CreateTerminalInput = { kind: 'cmd', cols: 80, rows: 24, cwd: 'C:\\work' }
    expect(applyProviderSecret(input, 'cmd', DEFAULT_SETTINGS, () => 'secret')).toBe(input)
  })
})

describe('TerminalManager remote size arbitration', () => {
  function setup() {
    const resizes: [string, number, number][] = []
    let emit: (event: import('../../shared/types').PtyEvent) => void = () => undefined
    let tap: (id: string, data: string) => void = () => undefined
    const sizes = new Map<string, { cols: number; rows: number }>()
    const core = {
      create: (id: string, input: CreateTerminalInput) => { sizes.set(id, { cols: input.cols!, rows: input.rows! }); return { pid: 1 } },
      resize: (id: string, cols: number, rows: number) => { resizes.push([id, cols, rows]); sizes.set(id, { cols, rows }) },
      kill: () => undefined,
      size: (id: string) => sizes.get(id) ?? null,
      setScrollback: () => undefined,
      restart: () => ({ pid: 2 })
    }
    const manager = new TerminalManager(() => null, () => DEFAULT_SETTINGS, undefined, undefined, (e, t) => {
      emit = e
      tap = t
      return core as never
    })
    manager.setShells([{ id: 'cmd', name: 'cmd', kind: 'cmd', command: 'cmd.exe', args: [] }])
    return { manager, resizes, sizes, emit: (e: import('../../shared/types').PtyEvent) => emit(e), tap: (id: string, d: string) => tap(id, d) }
  }

  it('remembers desktop resizes while a phone holds the size, then restores them', () => {
    const { manager, resizes, sizes } = setup()
    manager.create('t1', 'cmd', 120, 30)
    manager.setRemoteSize('t1', { cols: 40, rows: 20 })
    manager.resize('t1', 150, 40)
    expect(sizes.get('t1')).toEqual({ cols: 40, rows: 20 })
    manager.setRemoteSize('t1', null)
    expect(sizes.get('t1')).toEqual({ cols: 150, rows: 40 })
    expect(resizes.at(-1)).toEqual(['t1', 150, 40])
  })

  it('spawns at the phone size when the phone subscribed first', () => {
    const { manager, sizes } = setup()
    manager.setRemoteSize('t2', { cols: 44, rows: 22 })
    manager.create('t2', 'cmd', 120, 30)
    expect(sizes.get('t2')).toEqual({ cols: 44, rows: 22 })
    manager.setRemoteSize('t2', null)
    expect(sizes.get('t2')).toEqual({ cols: 120, rows: 30 })
  })

  it('keeps the phone size across a restart', () => {
    const { manager, resizes } = setup()
    manager.create('t3', 'cmd', 120, 30)
    manager.setRemoteSize('t3', { cols: 50, rows: 25 })
    manager.restart('t3')
    expect(resizes.at(-1)).toEqual(['t3', 50, 25])
  })

  it('forwards tapped output and exit events to listeners', () => {
    const { manager, emit, tap } = setup()
    const seen: string[] = []
    const off = manager.onOutput((event) => seen.push(event.kind === 'data' ? `data:${event.data}` : event.kind))
    tap('t1', 'hello')
    emit({ kind: 'data', ptyId: 't1', data: 'batched' })
    emit({ kind: 'exit', ptyId: 't1', exitCode: 0, durationMs: 5 })
    off()
    tap('t1', 'after')
    expect(seen).toEqual(['data:hello', 'exit'])
  })
})
