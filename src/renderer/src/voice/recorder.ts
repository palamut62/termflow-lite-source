import { VOICE_SAMPLE_RATE, encodeWav, rms } from '../../../shared/wav'

/** Hard limit for one dictation. */
export const MAX_RECORDING_MS = 60_000

export interface Recording {
  /** Stop and get the WAV (null when nothing was captured). */
  stop(): Promise<{ wav: Uint8Array; seconds: number; peak: number } | null>
  cancel(): void
}

/** Why the microphone could not be used, in words the user can act on. */
export function microphoneError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow apps to use the microphone in Windows Settings > Privacy & security > Microphone.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.'
  if (name === 'NotReadableError') return 'The microphone is in use by another app or cannot be opened.'
  return 'The microphone could not be started.'
}

/**
 * Records mono 16 kHz audio from the default microphone. The audio context
 * runs at the target rate, so Chromium resamples and no extra pass is needed.
 */
export async function startRecording(onLevel: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  })
  const context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE })
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessor keeps this dependency-free (an AudioWorklet would need its own module file).
  const processor = context.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  let peak = 0
  processor.onaudioprocess = (event) => {
    const data = new Float32Array(event.inputBuffer.getChannelData(0))
    chunks.push(data)
    const level = rms(data)
    peak = Math.max(peak, level)
    onLevel(level)
  }
  source.connect(processor)
  processor.connect(context.destination)

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    processor.onaudioprocess = null
    try { source.disconnect(); processor.disconnect() } catch { /* already gone */ }
    for (const track of stream.getTracks()) track.stop()
    void context.close().catch(() => undefined)
  }

  return {
    async stop() {
      close()
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      if (length === 0) return null
      const samples = new Float32Array(length)
      let offset = 0
      for (const chunk of chunks) {
        samples.set(chunk, offset)
        offset += chunk.length
      }
      return { wav: encodeWav(samples, context.sampleRate), seconds: length / context.sampleRate, peak }
    },
    cancel: close
  }
}
