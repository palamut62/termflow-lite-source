import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/types'
import { alertDecision, alertTitle, attentionOrder } from './attentionPolicy'

const settings = DEFAULT_SETTINGS.agentAlerts

describe('alertDecision', () => {
  it('marks and notifies only when the tab is not in front of the user', () => {
    expect(alertDecision('needs-input', false, true, settings)).toMatchObject({ mark: true, notify: true })
    expect(alertDecision('needs-input', true, false, settings)).toMatchObject({ mark: true, notify: true })
    expect(alertDecision('needs-input', true, true, settings)).toMatchObject({ mark: false, notify: false })
  })

  it('plays the sound by category even for the visible tab', () => {
    expect(alertDecision('needs-input', true, true, settings).sound).toBe(true)
    expect(alertDecision('done', true, true, settings).sound).toBe(false)
  })

  it('turns a category off completely when both channels are off', () => {
    const off = { ...settings, done: { system: false, sound: false } }
    expect(alertDecision('done', false, false, off)).toEqual({ mark: true, notify: false, sound: false })
  })
})

it('names the agent and the event', () => {
  expect(alertTitle('codex', 'needs-input')).toBe('Codex needs you')
  expect(alertTitle('claude', 'error')).toBe('Claude Code stopped with an error')
})

it('sorts needs-input before errors before finished turns', () => {
  expect((['done', 'needs-input', 'error'] as const).slice().sort(attentionOrder)).toEqual(['needs-input', 'error', 'done'])
})
