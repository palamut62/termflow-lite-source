/** Sample rate used for dictation: enough for speech, small to upload (32 KB/s). */
export const VOICE_SAMPLE_RATE = 16_000

/** Mono 16-bit PCM WAV from float samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number = VOICE_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return bytes
}

/** True for a RIFF/WAVE header; the main process checks uploads with it. */
export function isWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44) return false
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  return tag(0) === 'RIFF' && tag(8) === 'WAVE'
}

/** Root mean square loudness of a block, 0..1 (level meter and silence check). */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/** A short tone, used to test that a model accepts audio. */
export function toneWav(seconds = 0.6, frequency = 440, sampleRate: number = VOICE_SAMPLE_RATE): Uint8Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate))
  for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  return encodeWav(samples, sampleRate)
}
