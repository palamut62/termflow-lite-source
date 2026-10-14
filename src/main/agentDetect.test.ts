import { describe, expect, it } from 'vitest'
import { installedAgentIds } from './agentDetect'

describe('installedAgentIds', () => {
  it('lists the built-in agents whose program is on the search path', () => {
    const onPath = new Set(['claude', 'gemini', 'ollama'])
    const seen: string[] = []
    const find = (command: string, searchPath: string): string => {
      seen.push(searchPath)
      if (!onPath.has(command)) throw new Error('CLI not found')
      return command
    }
    expect(installedAgentIds('C:\bin', find)).toEqual(['claude', 'ollama-serve', 'gemini'])
    expect(new Set(seen)).toEqual(new Set(['C:\bin']))
  })
})
