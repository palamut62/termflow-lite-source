import { describe, expect, it } from 'vitest'
import { speechText, splitForSpeech } from './speak'

describe('speech text', () => {
  it('drops box drawing and joins wrapped lines', () => {
    expect(speechText('│ Merhaba dünya │\n│ nasılsın ─── │')).toBe('Merhaba dünya │ │ nasılsın'.replace(/│/g, '').replace(/\s+/g, ' ').trim())
  })
  it('splits into sentence-sized pieces and keeps all words', () => {
    const text = 'Birinci cümle burada, biraz uzun olsun ki birleşmesin. İkinci cümle de uzun uzun devam ediyor. Üçüncü.'
    const parts = splitForSpeech(text)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join(' ')).toBe(text)
  })
  it('cuts a very long run without sentence marks', () => {
    expect(splitForSpeech('kelime '.repeat(200)).every((p) => p.length <= 400)).toBe(true)
  })
})
