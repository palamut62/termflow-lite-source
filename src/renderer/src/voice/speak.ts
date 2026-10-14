import { useToastStore } from '../store/toastStore'
import { useVoiceStore } from '../store/voiceStore'

const MIN_CHUNK = 60
const MAX_CHUNK = 400
/** The server refuses more than this per request; longer selections are cut. */
const MAX_TOTAL = 5000

/** Terminal selections carry box drawing and wrapped lines; make it plain sentences. */
export function speechText(raw: string): string {
  return raw.replace(/[─-╿▀-▟]/g, ' ').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, MAX_TOTAL)
}

/** Sentence-sized pieces so the first sound starts after one short synthesis, not the whole text. */
export function splitForSpeech(text: string): string[] {
  const chunks: string[] = []
  let current = ''
  for (const sentence of text.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [text]) {
    if (current && current.length >= MIN_CHUNK) {
      chunks.push(current.trim())
      current = ''
    }
    current += sentence
    while (current.length > MAX_CHUNK) {
      const cut = current.lastIndexOf(' ', MAX_CHUNK)
      const at = cut > 0 ? cut : MAX_CHUNK
      chunks.push(current.slice(0, at).trim())
      current = current.slice(at)
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

let run: { ctx: AudioContext; cancelled: boolean } | null = null

export function stopSpeaking(): void {
  if (!run) return
  run.cancelled = true
  void run.ctx.close()
  run = null
  useVoiceStore.getState().set({ speaking: 'idle' })
}

/** Reads text aloud with the local voice; resolves to the time until the first sound, or an error. */
export async function speak(raw: string): Promise<{ firstSoundMs: number } | { error: string }> {
  const chunks = splitForSpeech(speechText(raw))
  if (!chunks.length) return { error: 'There is no text to read.' }
  stopSpeaking()
  const current = { ctx: new AudioContext(), cancelled: false }
  run = current
  const started = performance.now()
  let firstSoundMs = 0
  let endAt = 0
  useVoiceStore.getState().set({ speaking: 'preparing' })
  try {
    for (const chunk of chunks) {
      const answer = await window.termflow.voice.synth(chunk)
      if (current.cancelled) return { error: 'Stopped.' }
      if (!answer.ok || !answer.wav) throw new Error(answer.error ?? 'The voice could not be created.')
      const { buffer, byteOffset, byteLength } = answer.wav
      const audio = await current.ctx.decodeAudioData(buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer)
      if (current.cancelled) return { error: 'Stopped.' }
      const source = current.ctx.createBufferSource()
      source.buffer = audio
      source.connect(current.ctx.destination)
      endAt = Math.max(endAt, current.ctx.currentTime)
      source.start(endAt)
      endAt += audio.duration
      if (!firstSoundMs) {
        firstSoundMs = performance.now() - started
        useVoiceStore.getState().set({ speaking: 'playing' })
      }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, (endAt - current.ctx.currentTime) * 1000)))
    return { firstSoundMs }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The voice could not be created.'
    if (!current.cancelled) useToastStore.getState().show(message, 'error')
    return { error: message }
  } finally {
    if (run === current) stopSpeaking()
  }
}
