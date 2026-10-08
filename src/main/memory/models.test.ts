import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODELS_CACHE_TTL_MS, ModelCatalog, OPENROUTER_MODELS_URL, parseModels, testModel } from './models'

const RAW = {
  data: [
    {
      id: 'z/beta',
      name: 'Beta',
      context_length: 1_048_576,
      pricing: { prompt: '0.0000000228', completion: '0.00000128' },
      architecture: { output_modalities: ['text'] },
      supported_parameters: ['response_format', 'structured_outputs']
    },
    { id: 'a/alpha', context_length: 8192, pricing: { prompt: '0', completion: '0' }, supported_parameters: [] },
    { id: 'openrouter/auto', name: 'Auto', pricing: { prompt: '-1', completion: '-1' } },
    { id: 'img/only', name: 'Images', architecture: { output_modalities: ['image'] } },
    { name: 'no id' }
  ]
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})
function cacheFile(): string {
  const d = mkdtempSync(join(tmpdir(), 'tf-models-'))
  dirs.push(d)
  return join(d, 'cache', 'openrouter-models.json')
}

describe('parseModels', () => {
  it('keeps text models, sorts by id and converts prices to USD per 1M tokens', () => {
    expect(parseModels(RAW)).toEqual([
      { id: 'a/alpha', name: 'a/alpha', contextLength: 8192, inputPrice: 0, outputPrice: 0, structured: false },
      { id: 'openrouter/auto', name: 'Auto', contextLength: 0, inputPrice: null, outputPrice: null, structured: false },
      { id: 'z/beta', name: 'Beta', contextLength: 1_048_576, inputPrice: 0.0228, outputPrice: 1.28, structured: true }
    ])
  })

  it('rejects an unexpected payload', () => {
    expect(() => parseModels({ models: [] })).toThrow('unexpected model list')
  })
})

describe('ModelCatalog', () => {
  it('fetches once, caches to disk and serves the cache until it is a day old', async () => {
    const file = cacheFile()
    let now = 1_000_000
    const fetchMock = vi.fn(async () => json(RAW))
    const catalog = new ModelCatalog(file, fetchMock, () => now)

    const first = await catalog.list()
    expect(first).toMatchObject({ source: 'network', fetchedAt: 1_000_000 })
    expect(first.models).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledWith(OPENROUTER_MODELS_URL, expect.any(Object))
    expect(JSON.parse(readFileSync(file, 'utf8')).models).toHaveLength(3)

    now += MODELS_CACHE_TTL_MS - 1
    // Yeni bir örnek de (uygulama yeniden açıldı) diskteki cache'i kullanır.
    expect(await new ModelCatalog(file, fetchMock, () => now).list()).toMatchObject({ source: 'cache', fetchedAt: 1_000_000 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now += 2
    expect(await catalog.list()).toMatchObject({ source: 'network', fetchedAt: now })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refetches a fresh cache when forced', async () => {
    const fetchMock = vi.fn(async () => json(RAW))
    const catalog = new ModelCatalog(cacheFile(), fetchMock, () => 5)
    await catalog.list()
    expect(await catalog.list(true)).toMatchObject({ source: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the old cache with an error when the refresh fails', async () => {
    const file = cacheFile()
    await new ModelCatalog(file, async () => json(RAW), () => 1).list()
    const offline = new ModelCatalog(file, async () => { throw new TypeError('fetch failed') }, () => 1 + MODELS_CACHE_TTL_MS * 2)
    const result = await offline.list()
    expect(result).toMatchObject({ source: 'cache', fetchedAt: 1, error: 'OpenRouter could not be reached.' })
    expect(result.models).toHaveLength(3)
  })

  it('reports an empty list without a cache and ignores a corrupt cache file', async () => {
    const file = cacheFile()
    const catalog = new ModelCatalog(file, async () => json({ error: 'x' }, 503), () => 1)
    expect(await catalog.list()).toEqual({ models: [], fetchedAt: 0, source: 'none', error: 'OpenRouter model list failed (503).' })
    expect(existsSync(file)).toBe(false)
  })

  it('treats a corrupt cache file as missing and refetches', async () => {
    const file = cacheFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{broken')
    const fetchMock = vi.fn(async () => json(RAW))
    expect(await new ModelCatalog(file, fetchMock, () => 1).list()).toMatchObject({ source: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares one request between concurrent callers', async () => {
    let release: (r: Response) => void = () => undefined
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    const catalog = new ModelCatalog(cacheFile(), fetchMock, () => 1)
    const a = catalog.list()
    const b = catalog.list(true)
    release(json(RAW))
    const [ra, rb] = await Promise.all([a, b])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(ra).toEqual(rb)
  })
})

describe('testModel', () => {
  const reply = (content: string, cost?: number): Response =>
    json({ choices: [{ message: { content } }], usage: { prompt_tokens: 20, completion_tokens: 4, ...(cost !== undefined ? { cost } : {}) } })

  it('passes when the model returns the expected JSON through json_schema', async () => {
    let t = 0
    const fetchMock = vi.fn(async () => { t += 850; return reply('{"ok":true}', 0.00002) })
    const result = await testModel('sk-or-k', 'z/beta', fetchMock, () => t)
    expect(result).toEqual({ ok: true, model: 'z/beta', latencyMs: 850, reply: '{"ok":true}', cost: 0.00002 })
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toMatchObject({ model: 'z/beta', response_format: { type: 'json_schema' } })
  })

  it('fails when the answer is not the expected JSON', async () => {
    const result = await testModel('k', 'm', async () => reply('Sure! OK'), () => 0)
    expect(result).toMatchObject({ ok: false, reply: 'Sure! OK' })
    expect(result.error).toMatch(/expected JSON/)
  })

  it('reports API errors such as a rejected key without retrying', async () => {
    const fetchMock = vi.fn(async () => json({ error: { message: 'bad key' } }, 401))
    const result = await testModel('k', 'm', fetchMock, () => 0)
    expect(result).toMatchObject({ ok: false, error: 'OpenRouter rejected the API key.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
