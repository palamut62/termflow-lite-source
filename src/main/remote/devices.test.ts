import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceStore, PAIRING_TTL_MS, formatPairingCode, normalizePairingCode } from './devices'

const dirs: string[] = []
function storePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tfl-remote-'))
  dirs.push(dir)
  return join(dir, 'remote-devices.json')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('DeviceStore', () => {
  it('pairs once with a fresh code and authenticates the issued token', () => {
    const store = new DeviceStore(storePath())
    const { code } = store.startPairing()
    const paired = store.pair(code, 'Pixel')
    expect(paired?.device.name).toBe('Pixel')
    expect(store.authenticate(paired!.token)?.id).toBe(paired!.device.id)
    // single use
    expect(store.pair(code, 'Again')).toBeNull()
  })

  it('rejects wrong and expired codes', () => {
    let now = 1_000
    const store = new DeviceStore(storePath(), () => now)
    const { code } = store.startPairing()
    expect(store.pair('x'.repeat(43), 'Phone')).toBeNull()
    now += PAIRING_TTL_MS + 1
    expect(store.pair(code, 'Phone')).toBeNull()
  })

  it('a new QR invalidates the previous code', () => {
    const store = new DeviceStore(storePath())
    const first = store.startPairing()
    store.startPairing()
    expect(store.pair(first.code, 'Phone')).toBeNull()
  })

  it('stores only token hashes and survives a restart', () => {
    const path = storePath()
    const store = new DeviceStore(path)
    const paired = store.pair(store.startPairing().code, '<b>Phone</b>\u0007')!
    const disk = readFileSync(path, 'utf-8')
    expect(disk).not.toContain(paired.token)
    const reloaded = new DeviceStore(path)
    expect(reloaded.authenticate(paired.token)?.name).toBe('<b>Phone</b>')
  })

  it('revoke removes access', () => {
    const store = new DeviceStore(storePath())
    const a = store.pair(store.startPairing().code, 'A')!
    const b = store.pair(store.startPairing().code, 'B')!
    expect(store.revoke(a.device.id)).toBe(true)
    expect(store.authenticate(a.token)).toBeNull()
    expect(store.authenticate(b.token)).not.toBeNull()
    store.revokeAll()
    expect(store.list()).toEqual([])
    expect(store.authenticate(b.token)).toBeNull()
  })

  it('issues short typeable codes and accepts them as people type them', () => {
    const store = new DeviceStore(storePath())
    const { code } = store.startPairing()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/)
    const typed = ` ${formatPairingCode(code).toLowerCase()} `
    expect(store.pair(typed, 'iPhone')?.device.name).toBe('iPhone')
  })

  it('reads O as 0 and I or L as 1', () => {
    expect(normalizePairingCode('o1-il 2')).toBe('01112')
  })

  it('ignores malformed tokens', () => {
    const store = new DeviceStore(storePath())
    expect(store.authenticate(undefined)).toBeNull()
    expect(store.authenticate('short')).toBeNull()
  })
})
