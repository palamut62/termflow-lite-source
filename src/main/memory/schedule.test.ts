import { describe, expect, it } from 'vitest'
import { memoryDue } from './schedule'

const HOUR = 60 * 60_000

describe('memoryDue', () => {
  it('runs when it never ran, and waits for the chosen interval otherwise', () => {
    expect(memoryDue(undefined, 'weekly', 1000)).toBe(true)
    expect(memoryDue(0, 'hourly', 1000)).toBe(true)
    expect(memoryDue(10 * HOUR, 'hourly', 10 * HOUR + 59 * 60_000)).toBe(false)
    expect(memoryDue(10 * HOUR, 'hourly', 11 * HOUR)).toBe(true)
    expect(memoryDue(10 * HOUR, 'daily', 33 * HOUR)).toBe(false)
    expect(memoryDue(10 * HOUR, 'daily', 34 * HOUR)).toBe(true)
    expect(memoryDue(10 * HOUR, 'weekly', 10 * HOUR + 6 * 24 * HOUR)).toBe(false)
    expect(memoryDue(10 * HOUR, 'weekly', 10 * HOUR + 7 * 24 * HOUR)).toBe(true)
  })
})
