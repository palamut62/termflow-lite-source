// Read aloud (docs/voice-input.md): text goes to the local tts-studyo server
// (Antalia-2 Mini / EMA Lightning, Turkish, CPU, offline); nothing leaves the PC.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SpeakResult, SpeakSettings } from '../../shared/types'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const HOST = '127.0.0.1'
const PORT = 8765 // tts-studyo default (TTS_PORT)
export const BASE_URL = `http://${HOST}:${PORT}`
/** tts-studyo refuses more than 5000 characters (TTS_MAX_CHARS). */
export const MAX_SPEAK_CHARS = 5000
/** Loading both models takes a while on a cold start. */
const START_TIMEOUT_MS = 90_000

let child: ChildProcess | null = null
let starting: Promise<string | null> | null = null

export function studioFolder(settings: SpeakSettings): string {
  return settings.studioDir || join(homedir(), 'Projects', 'tts-studyo')
}

export function studioPython(dir: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python')
}

async function isUp(fetchImpl: FetchLike): Promise<boolean> {
  try {
    return (await fetchImpl(`${BASE_URL}/api/models`)).ok
  } catch {
    return false
  }
}

/** Resolves to null when the server answers, else a message for the user. */
async function start(dir: string, fetchImpl: FetchLike): Promise<string | null> {
  const python = studioPython(dir)
  if (!existsSync(python) || !existsSync(join(dir, 'app', 'main.py'))) {
    return `tts-studyo was not found in ${dir}. Set its folder in Settings > Voice.`
  }
  child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', HOST, '--port', String(PORT)], {
    cwd: dir,
    env: { ...process.env, HF_HUB_OFFLINE: '1' },
    stdio: 'ignore',
    windowsHide: true
  })
  const mine = child
  mine.once('exit', () => { if (child === mine) child = null })
  const until = Date.now() + START_TIMEOUT_MS
  while (Date.now() < until) {
    if (child !== mine) return 'tts-studyo stopped while starting.'
    if (await isUp(fetchImpl)) return null
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  stopStudio()
  return 'tts-studyo did not start in time.'
}

export async function ensureStudio(settings: SpeakSettings, fetchImpl: FetchLike = fetch): Promise<string | null> {
  if (await isUp(fetchImpl)) return null
  starting ??= start(studioFolder(settings), fetchImpl).finally(() => { starting = null })
  return starting
}

/** Stops the server only if this app started it. */
export function stopStudio(): void {
  child?.kill()
  child = null
}

export async function synthesize(text: string, settings: SpeakSettings, fetchImpl: FetchLike = fetch): Promise<SpeakResult> {
  const clean = text.trim()
  if (!clean) return { ok: false, error: 'There is no text to read.' }
  if (clean.length > MAX_SPEAK_CHARS) return { ok: false, error: `Text is longer than ${MAX_SPEAK_CHARS} characters.` }
  const problem = await ensureStudio(settings, fetchImpl)
  if (problem) return { ok: false, error: problem }
  try {
    const response = await fetchImpl(`${BASE_URL}/api/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.model, text: clean, speed: settings.speed })
    })
    if (!response.ok) {
      const detail = await response.json().then((body: { detail?: unknown }) => body.detail, () => undefined)
      return { ok: false, error: typeof detail === 'string' ? detail : `tts-studyo answered ${response.status}.` }
    }
    return { ok: true, wav: new Uint8Array(await response.arrayBuffer()) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'tts-studyo could not be reached.' }
  }
}
