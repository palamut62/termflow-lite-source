import { describe, expect, it } from 'vitest'
import { pushHistory, step } from './tabHistory'

describe('tab history', () => {
  it('records visits, ignores repeats and drops forward history after a new visit', () => {
    let h = { stack: [] as string[], index: -1 }
    for (const id of ['a', 'b', 'b', 'c']) h = pushHistory(h, id)
    expect(h).toEqual({ stack: ['a', 'b', 'c'], index: 2 })
    h = step(h, -1, () => true)!
    h = pushHistory(h, 'd')
    expect(h).toEqual({ stack: ['a', 'b', 'd'], index: 2 })
  })

  it('skips closed tabs and stops at the ends', () => {
    const h = { stack: ['a', 'b', 'c'], index: 2 }
    expect(step(h, -1, (id) => id !== 'b')).toEqual({ stack: ['a', 'b', 'c'], index: 0 })
    expect(step(h, 1, () => true)).toBeNull()
    expect(step({ stack: ['a'], index: 0 }, -1, () => true)).toBeNull()
  })

  it('caps the history length', () => {
    let h = { stack: [] as string[], index: -1 }
    for (let i = 0; i < 60; i++) h = pushHistory(h, String(i), 50)
    expect(h.stack).toHaveLength(50)
    expect(h.stack[0]).toBe('10')
  })
})
