import { describe, expect, it, vi } from 'vitest'
import { chat, OpenRouterError, parseJsonObject } from './openrouter'
import { mergeMessages, parseSessionSummary, projectMarkdown, sessionMessages } from './prompts'
import type { StoredSession } from './store'

const ok = (content: string, usage = { prompt_tokens: 10, completion_tokens: 5 }): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 })

describe('OpenRouter client', () => {
  it('sends the model, schema and key and returns content with usage', async () => {
    const fetchMock = vi.fn(async () => ok('{"a":1}'))
    const result = await chat({ apiKey: 'sk-or-test', model: 'm/x', messages: [{ role: 'user', content: 'hi' }], jsonSchema: { name: 's', schema: { type: 'object' } } }, fetchMock)
    expect(result).toEqual({ content: '{"a":1}', usage: { promptTokens: 10, completionTokens: 5 } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('m/x')
    expect(body.response_format.json_schema.name).toBe('s')
  })

  it('reports cost and truncated answers', async () => {
    const response = new Response(JSON.stringify({ choices: [{ message: { content: 'a\nb' }, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.0015 } }), { status: 200 })
    await expect(chat({ apiKey: 'k', model: 'm', messages: [] }, async () => response)).resolves.toEqual({
      content: 'a\nb', usage: { promptTokens: 1, completionTokens: 2, cost: 0.0015 }, truncated: true
    })
  })

  it('retries rate limits and server errors, then succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(ok('done'))
    const promise = chat({ apiKey: 'k', model: 'm', messages: [] }, fetchMock)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toMatchObject({ content: 'done' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('maps fatal statuses to friendly errors without retrying', async () => {
    for (const [status, text] of [[401, 'rejected the API key'], [402, 'no credit'], [404, 'not found']] as const) {
      const fetchMock = vi.fn(async () => new Response('{}', { status }))
      const error = await chat({ apiKey: 'k', model: 'm', messages: [] }, fetchMock).catch((caught) => caught)
      expect(error).toBeInstanceOf(OpenRouterError)
      expect(error.status).toBe(status)
      expect(error.message).toContain(text)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
    const detail = await chat({ apiKey: 'k', model: 'm', messages: [] }, async () => new Response('{"error":{"message":"bad schema"}}', { status: 400 })).catch((caught) => caught)
    expect(detail.message).toBe('OpenRouter request failed (400): bad schema')
  })

  it('rejects empty, invalid and error payloads', async () => {
    await expect(chat({ apiKey: 'k', model: 'm', messages: [] }, async () => ok('  '))).rejects.toThrow('empty answer')
    await expect(chat({ apiKey: 'k', model: 'm', messages: [] }, async () => new Response('nope', { status: 200 }))).rejects.toThrow('invalid response')
    await expect(chat({ apiKey: 'k', model: 'm', messages: [] }, async () => new Response('{"error":{"message":"moderation"}}', { status: 200 }))).rejects.toThrow('moderation')
  })

  it('extracts JSON objects from fenced or chatty answers', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonObject('Here: {"b":[1]} done')).toEqual({ b: [1] })
    expect(parseJsonObject('[1,2]')).toBeNull()
    expect(parseJsonObject('{broken')).toBeNull()
  })
})

const stored = (id: string, updatedAt: number, extra: Partial<StoredSession['summary']> = {}): StoredSession => ({
  agent: 'codex', id, source: { mtime: updatedAt, size: 1 }, updatedAt, interrupted: id === 'b', files: ['src/a.ts'],
  summary: { goal: `goal ${id}`, done: ['did x'], unfinished: ['todo y'], problems: [], decisions: ['use pnpm'], lastState: 'stopped', ...extra }
})

describe('prompts', () => {
  it('validates session summaries', () => {
    expect(parseSessionSummary('{"goal":"Ship","done":["a",1,""],"unfinished":[],"problems":"x","decisions":[],"lastState":"ok"}'))
      .toEqual({ goal: 'Ship', done: ['a'], unfinished: [], problems: [], decisions: [], lastState: 'ok' })
    expect(parseSessionSummary('{"goal":"","done":[]}')).toBeNull()
    expect(parseSessionSummary('not json')).toBeNull()
  })

  it('builds the session prompt around the digest', () => {
    const [system, user] = sessionMessages('DIGEST')
    expect(system.content).toContain('Do not invent')
    expect(user.content).toBe('DIGEST')
  })

  it('orders sessions oldest first and keeps the newest when over budget', () => {
    const long = 'x'.repeat(250)
    const sessions = Array.from({ length: 400 }, (_, index) => stored(`s${index}`, Date.UTC(2026, 9, 1) + index * 60_000, { done: [long, long] }))
    const [, user] = mergeMessages('/repo', sessions) as [unknown, { content: string }]
    expect(user.content.startsWith('Project: /repo')).toBe(true)
    expect(user.content).toContain('goal s399')
    expect(user.content).not.toContain('goal s0\n')
    expect(user.content.indexOf('goal s398')).toBeLessThan(user.content.indexOf('goal s399'))
    expect(mergeMessages('/r', [stored('b', 0)])[1].content).toContain('(ended interrupted)')
  })

  it('wraps the merged body with deterministic frontmatter and a size cap', () => {
    const markdown = projectMarkdown({
      key: 'c:\\repo', path: 'C:\\Repo', now: Date.parse('2026-10-06T12:00:00Z'),
      body: '```markdown\n# Title\n## Status\nGood\n' + 'line\n'.repeat(2000) + '```',
      sessions: [stored('a', Date.parse('2026-10-05T10:00:00Z')), stored('b', Date.parse('2026-10-06T10:00:00Z'))]
    })
    expect(markdown).toMatch(/^---\nproject: C:\\Repo\nkey: c:\\repo\ngeneratedAt: 2026-10-06T12:00:00.000Z\nlastSessionAt: 2026-10-06T10:00:00.000Z\nsessions: 2\n---\n## Status\nGood/)
    expect(markdown).not.toContain('# Title')
    expect(markdown).not.toContain('```')
    expect(markdown.length).toBeLessThan(4_300)
  })
})
