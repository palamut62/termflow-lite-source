import { describe, expect, it } from 'vitest'
import { encodeWav, isWav, rms, toneWav } from './wav'

describe('wav', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000)
    const view = new DataView(bytes.buffer)
    expect(isWav(bytes)).toBe(true)
    expect(bytes.length).toBe(44 + 8)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767])
  })

  it('rejects non-wav data', () => {
    expect(isWav(new Uint8Array(10))).toBe(false)
    expect(isWav(new TextEncoder().encode('x'.repeat(60)))).toBe(false)
  })

  it('measures loudness and makes a test tone', () => {
    expect(rms(new Float32Array(100))).toBe(0)
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5)
    const tone = toneWav(0.5)
    expect(isWav(tone)).toBe(true)
    expect(tone.length).toBe(44 + 8000 * 2)
  })
})
