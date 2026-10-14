import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ScrollbackStore, trimToBytes } from './ScrollbackStore'

const dir = (): string => join(mkdtempSync(join(tmpdir(), 'tf-scrollback-')), 'scrollback')

describe('ScrollbackStore', () => {
  it('saves, loads and removes per tab, masking API keys', () => {
    const store = new ScrollbackStore(dir())
    store.save('tab1', '\x1b[32mok\x1b[0m\r\nexport KEY=sk-ant-abcdefghijklmnopqrstuvwxyz123456\r\n')
    const loaded = store.load('tab1')!
    expect(loaded).toContain('\x1b[32mok')
    expect(loaded).not.toContain('abcdefghijklmnop')
    store.remove('tab1')
    expect(store.load('tab1')).toBeNull()
  })

  it('ignores tab ids that could escape the folder', () => {
    const root = dir()
    const store = new ScrollbackStore(root)
    store.save('../evil', 'x')
    expect(store.load('../evil')).toBeNull()
    expect(existsSync(root)).toBe(false)
  })

  it('prunes tabs that are not in the session', () => {
    const root = dir()
    const store = new ScrollbackStore(root)
    store.save('keep', 'a')
    store.save('gone', 'b')
    store.prune(['keep'])
    expect(readdirSync(root)).toEqual(['keep.txt'])
  })

  it('drops the oldest files when the total limit is exceeded', () => {
    const root = dir()
    const store = new ScrollbackStore(root, 10)
    store.save('old', '123456')
    utimesSync(join(root, 'old.txt'), new Date(1000), new Date(1000))
    store.save('new', '123456')
    expect(readdirSync(root)).toEqual(['new.txt'])
  })
})

it('keeps the tail from a line start when trimming', () => {
  expect(trimToBytes('line1\nline2\nline3', 9)).toBe('line3')
  expect(trimToBytes('short', 100)).toBe('short')
})
