import { describe, expect, it } from 'vitest'
import { studioPython, synthesize } from './speak'

const on = { enabled: true, model: 'ema' as const, speed: 1.2, studioDir: '' }

describe('synthesize', () => {
  it('posts model, text and speed to tts-studyo and returns the WAV', async () => {
    const calls: { url: string; body?: string }[] = []
    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, body: init?.body as string | undefined })
      return url.endsWith('/api/models') ? new Response('[]') : new Response(new Uint8Array([82, 73, 70, 70]))
    }
    const result = await synthesize(' Merhaba. ', on, impl)
    expect(result.ok).toBe(true)
    expect(Array.from(result.wav!)).toEqual([82, 73, 70, 70])
    expect(JSON.parse(calls[1].body!)).toEqual({ model: 'ema', text: 'Merhaba.', speed: 1.2 })
  })

  it('reports the server error text and refuses empty or too long text', async () => {
    const impl = async (url: string): Promise<Response> =>
      url.endsWith('/api/models') ? new Response('[]') : new Response(JSON.stringify({ detail: 'Model yok' }), { status: 404 })
    expect(await synthesize('x', on, impl)).toEqual({ ok: false, error: 'Model yok' })
    expect((await synthesize('  ', on, impl)).ok).toBe(false)
    expect((await synthesize('a'.repeat(5001), on, impl)).ok).toBe(false)
  })

  it('finds the venv python per platform', () => {
    expect(studioPython('/d', 'linux')).toContain('python')
    expect(studioPython('/d', 'linux')).not.toContain('Scripts')
    expect(studioPython('/d', 'win32')).toContain('python.exe')
  })
})
