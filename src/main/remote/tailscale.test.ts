import { describe, expect, it } from 'vitest'
import { findTailscaleAddress, isTailscaleIPv4 } from './tailscale'

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4' as const, internal, netmask: '', mac: '', cidr: null })

describe('tailscale address', () => {
  it('accepts only the CGNAT range', () => {
    expect(isTailscaleIPv4('100.89.62.116')).toBe(true)
    expect(isTailscaleIPv4('100.64.0.1')).toBe(true)
    expect(isTailscaleIPv4('100.127.255.255')).toBe(true)
    expect(isTailscaleIPv4('100.128.0.1')).toBe(false)
    expect(isTailscaleIPv4('100.63.0.1')).toBe(false)
    expect(isTailscaleIPv4('192.168.1.10')).toBe(false)
    expect(isTailscaleIPv4('100.89.62')).toBe(false)
  })

  it('prefers the interface named Tailscale', () => {
    expect(findTailscaleAddress({
      'Wi-Fi': [v4('172.20.10.6')],
      Other: [v4('100.70.0.2')],
      Tailscale: [v4('100.89.62.116')]
    })).toBe('100.89.62.116')
  })

  it('falls back to any CGNAT address and never to the LAN', () => {
    expect(findTailscaleAddress({ tailscale0: [], utun3: [v4('100.101.1.1')] })).toBe('100.101.1.1')
    expect(findTailscaleAddress({ 'Wi-Fi': [v4('192.168.1.5')], lo: [v4('127.0.0.1', true)] })).toBeNull()
  })
})
