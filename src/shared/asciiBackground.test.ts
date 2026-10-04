import { describe, expect, it } from 'vitest'
import { glyphRows, normalizeAsciiBackgrounds } from './asciiBackground'

const IMAGE = 'data:image/jpeg;base64,QUJD'
const px = (...values: number[]): number[] => values.flatMap((v) => [v, v, v, 255])

describe('normalizeAsciiBackgrounds', () => {
  it('keeps valid entries and clamps numbers', () => {
    expect(normalizeAsciiBackgrounds({ powershell: { image: IMAGE, density: 99, opacity: 1, charset: 'blocks' } })).toEqual({
      powershell: { image: IMAGE, density: 16, opacity: 5, charset: 'blocks' }
    })
  })

  it('fills defaults for missing fields', () => {
    expect(normalizeAsciiBackgrounds({ a: { image: IMAGE } }).a).toEqual({ image: IMAGE, density: 6, opacity: 22, charset: 'dots' })
  })

  it('drops paths, remote URLs, svg and junk', () => {
    expect(normalizeAsciiBackgrounds({
      a: { image: 'C:\\Users\\me\\cat.png' },
      b: { image: 'https://example.com/cat.png' },
      c: { image: 'data:image/svg+xml;base64,PHN2Zz4=' },
      d: null,
      e: 'x'
    })).toEqual({})
    expect(normalizeAsciiBackgrounds([])).toEqual({})
    expect(normalizeAsciiBackgrounds(undefined)).toEqual({})
  })
})

describe('glyphRows', () => {
  it('maps dark to space and bright to the densest glyph', () => {
    expect(glyphRows(px(0, 128, 255), 3, 1, 'ascii', false)).toEqual([' +@'])
  })

  it('inverts for light themes', () => {
    expect(glyphRows(px(0, 255), 2, 1, 'blocks', true)).toEqual(['█ '])
  })

  it('stretches a dim picture to the full ramp', () => {
    expect(glyphRows(px(10, 40), 2, 1, 'blocks', false)).toEqual([' █'])
  })

  it('treats a flat picture as is instead of dividing by zero', () => {
    expect(glyphRows(px(0, 0), 2, 1, 'dots', false)).toEqual(['  '])
  })

  it('returns one string per row', () => {
    expect(glyphRows(px(255, 255, 255, 255), 2, 2, 'dots', false)).toEqual(['••', '••'])
  })
})
