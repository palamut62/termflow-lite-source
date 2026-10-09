import { networkInterfaces } from 'os'

type Interfaces = ReturnType<typeof networkInterfaces>

/** Tailscale hands out IPv4 addresses from the CGNAT range 100.64.0.0/10. */
export function isTailscaleIPv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127
}

/**
 * The address the remote server binds to. An interface named "Tailscale"
 * wins; otherwise the first CGNAT address. Null when Tailscale is not up, in
 * which case the server stays closed rather than falling back to the LAN.
 */
export function findTailscaleAddress(interfaces: Interfaces = networkInterfaces()): string | null {
  let fallback: string | null = null
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isTailscaleIPv4(entry.address)) continue
      if (/tailscale/i.test(name)) return entry.address
      fallback ??= entry.address
    }
  }
  return fallback
}
