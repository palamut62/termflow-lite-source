// OpenRouter chat completions istemcisi (ana süreçten; renderer CSP dışarıyı engeller).

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'input_audio'; input_audio: { data: string; format: 'wav' } }

export interface ChatMessage {
  role: 'system' | 'user'
  content: string | ChatContentPart[]
}

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  /** USD, OpenRouter'ın bildirdiği. */
  cost?: number
}

export interface ChatResult {
  content: string
  usage: ChatUsage
  /** true: cevap max_tokens'a takılıp kesildi. */
  truncated?: boolean
}

export interface ChatRequest {
  apiKey: string
  model: string
  messages: ChatMessage[]
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  maxTokens?: number
  signal?: AbortSignal
  temperature?: number
  /** Chat completions endpoint; E2E points it at a local fake. */
  url?: string
  /** An empty answer is a valid result (dictation of silence), not an error. */
  allowEmpty?: boolean
}

export class OpenRouterError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504])
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function friendlyError(status: number, body: string): string {
  if (status === 401) return 'OpenRouter rejected the API key.'
  if (status === 402) return 'OpenRouter account has no credit left.'
  if (status === 404) return 'The selected OpenRouter model was not found.'
  if (status === 429) return 'OpenRouter rate limit reached. Try again later.'
  let detail = ''
  try { detail = String((JSON.parse(body) as { error?: { message?: unknown } }).error?.message ?? '') } catch { /* düz metin */ }
  return `OpenRouter request failed (${status})${detail ? `: ${detail.slice(0, 200)}` : ''}`
}

export async function chat(request: ChatRequest, fetchImpl: FetchLike = fetch, retries = 2): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 2_000,
    // Akıl yürüten modellerde düşünme maliyetini düşük tut, çıktıya katma.
    reasoning: { effort: 'low', exclude: true }
  }
  if (request.jsonSchema) {
    body.response_format = { type: 'json_schema', json_schema: { name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema } }
  }
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetchImpl(request.url ?? OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://www.termflowlite.lol',
          'X-Title': 'TermFlow Lite'
        },
        body: JSON.stringify(body),
        signal: request.signal ?? AbortSignal.timeout(120_000)
      })
    } catch (error) {
      if (attempt < retries && !request.signal?.aborted) {
        await sleep(1_000 * 2 ** attempt)
        continue
      }
      throw new OpenRouterError(`OpenRouter could not be reached: ${error instanceof Error ? error.message : String(error)}`)
    }
    const text = await response.text()
    if (!response.ok) {
      if (attempt < retries && RETRYABLE.has(response.status)) {
        await sleep(1_500 * 2 ** attempt)
        continue
      }
      throw new OpenRouterError(friendlyError(response.status, text), response.status)
    }
    let parsed: { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; error?: { message?: string } }
    try { parsed = JSON.parse(text) } catch { throw new OpenRouterError('OpenRouter returned an invalid response.') }
    if (parsed.error) throw new OpenRouterError(`OpenRouter error: ${String(parsed.error.message ?? 'unknown').slice(0, 200)}`)
    const raw = parsed.choices?.[0]?.message?.content
    const content = request.allowEmpty && (raw === null || raw === undefined) ? '' : raw
    if (typeof content !== 'string' || (!content.trim() && !request.allowEmpty)) throw new OpenRouterError('OpenRouter returned an empty answer.')
    const cost = parsed.usage?.cost
    return {
      content,
      usage: {
        promptTokens: parsed.usage?.prompt_tokens ?? 0,
        completionTokens: parsed.usage?.completion_tokens ?? 0,
        ...(typeof cost === 'number' && Number.isFinite(cost) ? { cost } : {})
      },
      ...(parsed.choices?.[0]?.finish_reason === 'length' ? { truncated: true } : {})
    }
  }
}

/** Modelin cevabındaki ilk JSON nesnesi (kod bloğu ya da önsöz olsa bile). */
export function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}
