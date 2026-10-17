import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentModelCatalog, parseGrokModels, parseOpencodeModels } from './models'

const OPENCODE = [
  'opencode/glm-5.3-flash-free',
  '{',
  '  "id": "glm-5.3-flash-free",',
  '  "name": "GLM 5.3 Flash Free",',
  '  "cost": { "input": 0, "output": 0 },',
  '  "limit": { "context": 200000, "output": 32000 },',
  '  "capabilities": { "toolcall": true }',
  '}',
  'deepseek/deepseek-flash',
  '{',
  '  "name": "DeepSeek Flash",',
  '  "cost": { "input": 0.27, "output": 1.1 },',
  '  "capabilities": { "toolcall": false }',
  '}',
  'bare/model'
].join('\r\n')

describe('parseOpencodeModels', () => {
  it('reads id, name, price, context and tool calling', () => {
    const models = parseOpencodeModels(OPENCODE)
    expect(models.map((m) => m.id)).toEqual(['bare/model', 'deepseek/deepseek-flash', 'opencode/glm-5.3-flash-free'])
    expect(models[2]).toMatchObject({ name: 'GLM 5.3 Flash Free', inputPrice: 0, outputPrice: 0, contextLength: 200000, structured: true })
    expect(models[1]).toMatchObject({ inputPrice: 0.27, outputPrice: 1.1, structured: false })
    expect(models[0]).toMatchObject({ name: 'bare/model', inputPrice: null })
  })

  it('reads the plain list too', () => {
    expect(parseOpencodeModels('opencode/a-free\nopencode/b\n').map((m) => m.id)).toEqual(['opencode/a-free', 'opencode/b'])
  })
})

describe('parseGrokModels', () => {
  it('reads the available models and marks the default', () => {
    const models = parseGrokModels('You are logged in with grok.com.\n\nDefault model: grok-4.7\n\nAvailable models:\n  * grok-4.7 (default)\n    grok-4.7-mini\n')
    expect(models.map((m) => [m.id, m.name])).toEqual([['grok-4.7', 'grok-4.7 (default)'], ['grok-4.7-mini', 'grok-4.7-mini']])
    expect(parseGrokModels('not logged in')).toEqual([])
  })
})

describe('agentModelCatalog', () => {
  let dir = ''
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('runs the CLI once and serves the disk cache afterwards', async () => {
    dir = mkdtempSync(join(tmpdir(), 'termflow-orch-models-'))
    const run = vi.fn(async () => OPENCODE)
    const catalog = agentModelCatalog(dir, 'opencode', run)!
    expect((await catalog.list()).source).toBe('network')
    expect((await catalog.list()).source).toBe('cache')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('opencode', ['models', '--verbose'])
  })

  it('returns the stale list with a warning when the CLI fails', async () => {
    dir = mkdtempSync(join(tmpdir(), 'termflow-orch-models-'))
    let fail = false
    const catalog = agentModelCatalog(dir, 'grok', async () => {
      if (fail) throw new Error('grok: not logged in')
      return 'Available models:\n  * grok-4.7 (default)\n'
    })!
    await catalog.list()
    fail = true
    const list = await catalog.list(true)
    expect(list.models.map((m) => m.id)).toEqual(['grok-4.7'])
    expect(list.error).toBe('grok: not logged in')
  })

  it('has no catalog for agents without a list command', () => {
    expect(agentModelCatalog('/x', 'codex', async () => '')).toBeNull()
    expect(agentModelCatalog('/x', 'claude', async () => '')).toBeNull()
  })
})
