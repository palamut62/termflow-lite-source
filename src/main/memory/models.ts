// OpenRouter model kataloğu: tüm modeller API'den çekilir, diske cache'lenir
// (günde en fazla bir kez ağa çıkılır) ve seçili model gerçek bir istekle test edilir.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { OpenRouterModel, OpenRouterModelList, OpenRouterModelTest } from '../../shared/types'
import { chat, parseJsonObject } from './openrouter'

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
/** Cache bu kadar süre taze sayılır; sonra bir sonraki istekte arka planda değil, o istekte yenilenir. */
export const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

interface RawModel {
  id?: unknown
  name?: unknown
  context_length?: unknown
  pricing?: { prompt?: unknown; completion?: unknown; audio?: unknown }
  architecture?: { output_modalities?: unknown; input_modalities?: unknown }
  supported_parameters?: unknown
}

/** Token başı fiyat metnini 1M token başı USD'ye çevirir; '-1' (değişken) ve bozuk değerler null. */
function perMillion(value: unknown): number | null {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 1_000_000 * 1e6) / 1e6
}

/** /models cevabını sade kayıtlara indirir: yalnız metin üreten modeller, id'ye göre sıralı. */
export function parseModels(json: unknown): OpenRouterModel[] {
  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data)) throw new Error('OpenRouter returned an unexpected model list.')
  const models: OpenRouterModel[] = []
  for (const raw of data as RawModel[]) {
    if (typeof raw?.id !== 'string' || !raw.id) continue
    const outputs = raw.architecture?.output_modalities
    if (Array.isArray(outputs) && !outputs.includes('text')) continue
    const params = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : []
    const inputs = raw.architecture?.input_modalities
    const audio = Array.isArray(inputs) && inputs.includes('audio')
    models.push({
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
      contextLength: typeof raw.context_length === 'number' ? raw.context_length : 0,
      inputPrice: perMillion(raw.pricing?.prompt),
      outputPrice: perMillion(raw.pricing?.completion),
      structured: params.includes('structured_outputs'),
      audio,
      ...(audio ? { audioPrice: perMillion(raw.pricing?.audio) } : {})
    })
  }
  return models.sort((a, b) => a.id.localeCompare(b.id))
}

interface CacheFile {
  fetchedAt: number
  models: OpenRouterModel[]
}

export class ModelCatalog {
  private pending: Promise<OpenRouterModelList> | null = null

  constructor(
    private readonly file: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
    /** OpenRouter yerine baska kaynak (orn. ajan CLI'inin model listesi); cache davranisi ayni. */
    private readonly load?: () => Promise<OpenRouterModel[]>
  ) {}

  /**
   * Cache tazeyse ağa çıkmadan döner. Değilse (ya da force) yeniden çeker;
   * çekim başarısızsa eski cache hatayla birlikte döner. Aynı anda gelen
   * istekler tek ağ çağrısını paylaşır.
   */
  list(force = false): Promise<OpenRouterModelList> {
    const cached = this.readCache()
    if (!force && cached && this.now() - cached.fetchedAt < MODELS_CACHE_TTL_MS) {
      return Promise.resolve({ models: cached.models, fetchedAt: cached.fetchedAt, source: 'cache' })
    }
    this.pending ??= this.refresh(cached).finally(() => { this.pending = null })
    return this.pending
  }

  private async refresh(cached: CacheFile | null): Promise<OpenRouterModelList> {
    try {
      const models = this.load ? await this.load() : await this.fetchOpenRouter()
      if (!models.length) throw new Error(this.load ? 'The CLI returned no models.' : 'OpenRouter returned no models.')
      const fetchedAt = this.now()
      this.writeCache({ fetchedAt, models })
      return { models, fetchedAt, source: 'network' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const detail = /fetch failed|ENOTFOUND|ECONN|timeout|aborted/i.test(message) ? 'OpenRouter could not be reached.' : message
      return cached
        ? { models: cached.models, fetchedAt: cached.fetchedAt, source: 'cache', error: detail }
        : { models: [], fetchedAt: 0, source: 'none', error: detail }
    }
  }

  private async fetchOpenRouter(): Promise<OpenRouterModel[]> {
    const response = await this.fetchImpl(OPENROUTER_MODELS_URL, {
      headers: { 'HTTP-Referer': 'https://www.termflowlite.lol', 'X-Title': 'TermFlow Lite' },
      signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error(`OpenRouter model list failed (${response.status}).`)
    return parseModels(await response.json())
  }

  private readCache(): CacheFile | null {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<CacheFile>
      if (typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.models)) return null
      // Caches written before the audio flag existed are refreshed once.
      if (parsed.models.length > 0 && typeof (parsed.models[0] as Partial<OpenRouterModel>).audio !== 'boolean') return null
      return { fetchedAt: parsed.fetchedAt, models: parsed.models }
    } catch {
      return null
    }
  }

  private writeCache(cache: CacheFile): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(cache))
      renameSync(tmp, this.file)
    } catch (error) {
      console.warn('[memory] model cache could not be written:', error)
    }
  }
}

const TEST_SCHEMA = {
  name: 'ping',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
}

/**
 * Seçili modeli memory'nin gerçekte kullandığı şekilde (json_schema ile) çok
 * kısa bir istekle dener. Yeniden deneme yapılmaz; sonuç hemen görünsün.
 */
export async function testModel(apiKey: string, model: string, fetchImpl: FetchLike = fetch, now: () => number = Date.now): Promise<OpenRouterModelTest> {
  const started = now()
  try {
    const result = await chat({
      apiKey,
      model,
      messages: [{ role: 'user', content: 'Connection test. Reply with the JSON object {"ok": true} and nothing else.' }],
      jsonSchema: TEST_SCHEMA,
      maxTokens: 200,
      signal: AbortSignal.timeout(30_000)
    }, fetchImpl, 0)
    const latencyMs = now() - started
    const reply = result.content.trim().slice(0, 200)
    const cost = result.usage.cost
    if (parseJsonObject(result.content)?.ok !== true) {
      return { ok: false, model, latencyMs, reply, ...(cost !== undefined ? { cost } : {}), error: 'The model answered but not with the expected JSON; memory summaries may fail with it.' }
    }
    return { ok: true, model, latencyMs, reply, ...(cost !== undefined ? { cost } : {}) }
  } catch (error) {
    return { ok: false, model, latencyMs: now() - started, error: error instanceof Error ? error.message : String(error) }
  }
}
