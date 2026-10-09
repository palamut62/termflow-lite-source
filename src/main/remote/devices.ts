import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/** A one-time pairing code is valid for this long after the QR is shown. */
export const PAIRING_TTL_MS = 5 * 60_000
const MAX_DEVICES = 20
/** lastSeenAt is persisted at most this often per device. */
const SEEN_WRITE_INTERVAL_MS = 60_000

interface StoredDevice {
  id: string
  name: string
  /** SHA-256 (hex) of the device token; the token itself never touches disk. */
  tokenHash: string
  createdAt: number
  lastSeenAt: number
}

export interface PairedDevice {
  id: string
  name: string
  createdAt: number
  lastSeenAt: number
}

const token = (): string => randomBytes(32).toString('base64url')

/** Crockford base32: no I, L, O or U, so a code read off the screen is typed right. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 10

/**
 * Pairing codes are short enough to type (a home-screen web app on iPhone has
 * its own storage and cannot open the QR link): 50 bits, single use, five
 * minutes, and the server allows ten attempts a minute per address.
 */
function pairingCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** Accepts the code as typed: any case, spaces or dashes, O for 0 and I/L for 1. */
export function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

/** "7KQ2MX9HDA" -> "7KQ2M-X9HDA" for display. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : ''
  return name || 'Phone'
}

/**
 * Paired phones (userData/remote-devices.json) and the short-lived pairing
 * codes behind the QR. Codes live only in memory, are single-use and expire
 * after five minutes; device tokens are stored as SHA-256 hashes.
 */
export class DeviceStore {
  private devices: StoredDevice[]
  /** forDevice: the code renews this paired device instead of adding a new one. */
  private pairing: { codeHash: string; expiresAt: number; forDevice?: string } | null = null
  private lastSeenWrite = new Map<string, number>()

  constructor(private readonly filePath: string, private readonly now: () => number = Date.now) {
    this.devices = this.load()
  }

  private load(): StoredDevice[] {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as { devices?: unknown }
      if (!Array.isArray(parsed.devices)) return []
      return parsed.devices.filter((d): d is StoredDevice =>
        !!d && typeof d === 'object' &&
        typeof (d as StoredDevice).id === 'string' &&
        typeof (d as StoredDevice).tokenHash === 'string' && /^[0-9a-f]{64}$/.test((d as StoredDevice).tokenHash) &&
        typeof (d as StoredDevice).createdAt === 'number'
      ).map((d) => ({ ...d, name: cleanName(d.name), lastSeenAt: typeof d.lastSeenAt === 'number' ? d.lastSeenAt : d.createdAt }))
    } catch {
      return []
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify({ devices: this.devices }, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (error) {
      console.warn('[remote] failed to persist devices:', error)
    }
  }

  /**
   * New pairing code; any previous, unused code stops working. With
   * `forDevice` the code renews that device: same entry, new key, the old key
   * stops working (e.g. moving from the browser to the home-screen app).
   */
  startPairing(forDevice?: string): { code: string; expiresAt: number } {
    if (forDevice !== undefined && !this.devices.some((d) => d.id === forDevice)) throw new Error('That device is no longer paired.')
    const code = pairingCode()
    const expiresAt = this.now() + PAIRING_TTL_MS
    this.pairing = { codeHash: hash(code), expiresAt, forDevice }
    return { code, expiresAt }
  }

  cancelPairing(): void {
    this.pairing = null
  }

  /** Exchange a pairing code for a device token. The code is consumed on success. */
  pair(code: unknown, name: unknown): { device: PairedDevice; token: string; renewed: boolean } | null {
    if (typeof code !== 'string' || code.length > 100 || !this.pairing || this.pairing.expiresAt < this.now()) return null
    const expected = Buffer.from(this.pairing.codeHash, 'hex')
    const actual = Buffer.from(hash(normalizePairingCode(code)), 'hex')
    if (!timingSafeEqual(expected, actual)) return null
    const forDevice = this.pairing.forDevice
    this.pairing = null
    const deviceToken = token()
    const now = this.now()
    const existing = forDevice ? this.devices.find((d) => d.id === forDevice) : undefined
    if (existing) {
      existing.tokenHash = hash(deviceToken)
      existing.lastSeenAt = now
      this.save()
      return { device: this.public(existing), token: deviceToken, renewed: true }
    }
    const device: StoredDevice = { id: randomBytes(8).toString('hex'), name: cleanName(name), tokenHash: hash(deviceToken), createdAt: now, lastSeenAt: now }
    // Oldest devices make room once the cap is reached.
    this.devices = [...this.devices, device].slice(-MAX_DEVICES)
    this.save()
    return { device: this.public(device), token: deviceToken, renewed: false }
  }

  /** Resolve a device token; marks the device as seen. */
  authenticate(deviceToken: unknown): PairedDevice | null {
    if (typeof deviceToken !== 'string' || deviceToken.length < 20 || deviceToken.length > 100) return null
    const tokenHash = hash(deviceToken)
    const device = this.devices.find((d) => d.tokenHash === tokenHash)
    if (!device) return null
    this.touch(device.id)
    return this.public(device)
  }

  touch(id: string): void {
    const device = this.devices.find((d) => d.id === id)
    if (!device) return
    const now = this.now()
    device.lastSeenAt = now
    if (now - (this.lastSeenWrite.get(id) ?? 0) >= SEEN_WRITE_INTERVAL_MS) {
      this.lastSeenWrite.set(id, now)
      this.save()
    }
  }

  list(): PairedDevice[] {
    return this.devices.map((d) => this.public(d))
  }

  revoke(id: string): boolean {
    const before = this.devices.length
    this.devices = this.devices.filter((d) => d.id !== id)
    if (this.devices.length === before) return false
    this.save()
    return true
  }

  revokeAll(): void {
    this.devices = []
    this.save()
  }

  private public(d: StoredDevice): PairedDevice {
    return { id: d.id, name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt }
  }
}
