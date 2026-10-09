import { describe, expect, it } from 'vitest'
import { extractPairCode } from './qr'

describe('extractPairCode', () => {
  it('reads the code from a pairing link', () => {
    expect(extractPairCode('http://100.89.62.116:47321/#pair=7KQ2MX9HDA')).toBe('7KQ2MX9HDA')
  })

  it('accepts a bare code with or without the dash', () => {
    expect(extractPairCode('7KQ2M-X9HDA')).toBe('7KQ2MX9HDA')
    expect(extractPairCode(' 7kq2mx9hda ')).toBe('7kq2mx9hda')
  })

  it('rejects anything else', () => {
    expect(extractPairCode('https://example.com/')).toBeNull()
    expect(extractPairCode('hello')).toBeNull()
  })
})
