import { beforeEach, describe, expect, it } from 'vitest'
import type { MediaInfo } from '../../../shared/ipc'
import { formatBytes, useMediaStore } from './mediaStore'

const info = (name: string): MediaInfo => ({ path: `C:\\shots\\${name}`, name, kind: 'image', size: 100, modifiedAt: 0, thumbnail: '' })

beforeEach(() => useMediaStore.setState({ items: [], viewing: null }))

describe('mediaStore', () => {
  it('keeps at most three open cards per tab and demotes the oldest to chips', () => {
    const { add } = useMediaStore.getState()
    for (const name of ['a.png', 'b.png', 'c.png', 'd.png']) add('t1', info(name), 'new')
    const items = useMediaStore.getState().items
    expect(items.filter((i) => i.card).map((i) => i.name)).toEqual(['b.png', 'c.png', 'd.png'])
    expect(items.find((i) => i.name === 'a.png')?.card).toBe(false)
  })

  it('moves a repeated file to the front instead of duplicating it', () => {
    const { add } = useMediaStore.getState()
    add('t1', info('a.png'), 'drop')
    add('t1', info('b.png'), 'drop')
    add('t1', info('a.png'), 'paste')
    const items = useMediaStore.getState().items
    expect(items.map((i) => i.name)).toEqual(['b.png', 'a.png'])
    expect(items[1].source).toBe('paste')
  })

  it('keeps tabs separate and caps history per tab', () => {
    const { add, clearTab } = useMediaStore.getState()
    for (let i = 0; i < 12; i++) add('t1', info(`${i}.png`), 'new')
    add('t2', info('other.png'), 'drop')
    expect(useMediaStore.getState().items.filter((i) => i.tabId === 't1')).toHaveLength(8)
    clearTab('t1')
    expect(useMediaStore.getState().items.map((i) => i.tabId)).toEqual(['t2'])
  })

  it('closes the viewer when its item is removed', () => {
    const { add, view, remove } = useMediaStore.getState()
    add('t1', info('a.png'), 'drop')
    const id = useMediaStore.getState().items[0].id
    view(id)
    remove(id)
    expect(useMediaStore.getState().viewing).toBeNull()
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
