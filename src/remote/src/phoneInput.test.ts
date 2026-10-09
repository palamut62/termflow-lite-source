import { describe, expect, it } from 'vitest'
import { SENTINEL, diffInput, keySequence } from './phoneInput'

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods })

describe('diffInput', () => {
  it('sends typed characters as they appear', () => {
    expect(diffInput(SENTINEL, `${SENTINEL}l`)).toBe('l')
    expect(diffInput(`${SENTINEL}l`, `${SENTINEL}ls`)).toBe('s')
  })

  it('turns removed characters into DEL, including into the sentinel on an empty field', () => {
    expect(diffInput(`${SENTINEL}ls`, `${SENTINEL}l`)).toBe('\x7f')
    expect(diffInput(SENTINEL, ' ')).toBe('\x7f')
  })

  it('replays an autocorrected word as backspaces plus the new word', () => {
    expect(diffInput(`${SENTINEL}git stauts`, `${SENTINEL}git status `)).toBe('\x7f\x7f\x7ftus ')
  })

  it('maps newlines to Enter', () => {
    expect(diffInput(SENTINEL, `${SENTINEL}a\nb`)).toBe('a\rb')
  })

  it('handles unicode text', () => {
    expect(diffInput(SENTINEL, `${SENTINEL}çağrı`)).toBe('çağrı')
  })
})

describe('keySequence', () => {
  it('maps special keys and cursor modes', () => {
    expect(keySequence(key('Enter'), false)).toBe('\r')
    expect(keySequence(key('Tab', { shiftKey: true }), false)).toBe('\x1b[Z')
    expect(keySequence(key('ArrowUp'), false)).toBe('\x1b[A')
    expect(keySequence(key('ArrowUp'), true)).toBe('\x1bOA')
    expect(keySequence(key('Escape'), false)).toBe('\x1b')
  })

  it('maps Ctrl+letter to control characters', () => {
    expect(keySequence(key('c', { ctrlKey: true }), false)).toBe('\x03')
    expect(keySequence(key('l', { ctrlKey: true }), false)).toBe('\x0c')
  })

  it('leaves plain characters to the field', () => {
    expect(keySequence(key('a'), false)).toBeNull()
  })
})
