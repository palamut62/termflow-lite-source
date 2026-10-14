import { describe, expect, it } from 'vitest'
import { findApiKeys, redactApiKeys, redactApiKeysInAnsi, TerminalSecretRedactor } from './secretRedaction'

describe('API key redaction', () => {
  it('recognizes common provider keys and labeled custom keys', () => {
    const openAi = `sk-proj-${'A1b2'.repeat(8)}`
    const custom = 'customKey1234567890abcdef'
    expect(findApiKeys(`OPENAI_API_KEY=${openAi} api-key: ${custom}`)).toEqual([openAi, custom])
  })

  it('masks an explicitly registered provider credential', () => {
    const redactor = new TerminalSecretRedactor()
    redactor.register('provider-key-without-a-known-prefix')
    expect(redactor.redact('token=provider-key-without-a-known-prefix')).toBe('token=************')
  })

  it('recognizes a pasted bare opaque credential but ignores normal commands', () => {
    expect(findApiKeys('Abcd1234efgh5678ijkl9012')).toEqual(['Abcd1234efgh5678ijkl9012'])
    expect(findApiKeys('npm run build')).toEqual([])
  })

  it('masks the UI copy without changing unrelated text', () => {
    const key = `sk-or-v1-${'a1'.repeat(16)}`
    expect(redactApiKeys(`export API_KEY=${key}`)).toBe('export API_KEY=************')
  })

  it('redacts a registered input when the PTY echoes it later', () => {
    const key = `ghp_${'A1'.repeat(20)}`
    const redactor = new TerminalSecretRedactor()
    redactor.registerInput(key)
    expect(redactor.redact(`prompt> ${key}\r\n`)).toBe('prompt> ************\r\n')
  })
})

describe('redactApiKeysInAnsi', () => {
  it('masks a key that shell colouring split with escape sequences', () => {
    const key = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789'
    const split = `echo \x1b[37m${key.slice(0, 19)}\x1b[39m\x1b[37m${key.slice(19)}\x1b[0m done`
    const out = redactApiKeysInAnsi(split)
    expect(out).not.toContain('mnopqrstuvwxyz0123456789')
    expect(out).toContain('echo ')
    expect(out).toContain(' done')
  })

  it('leaves text without keys untouched', () => {
    expect(redactApiKeysInAnsi('\x1b[32mok\x1b[0m')).toBe('\x1b[32mok\x1b[0m')
  })
})

it('masks the whole typed key, not the first prefix that looked like a key', () => {
  const redactor = new TerminalSecretRedactor()
  const key = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789'
  for (const ch of `echo ${key}`) redactor.registerInput(ch)
  const out = redactor.redact(`${key}\r\n`)
  expect(out).not.toContain('mnopqrstuvwxyz')
  expect(out.startsWith('************')).toBe(true)
})
