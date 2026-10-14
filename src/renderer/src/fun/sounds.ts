import type { SoundTheme } from '../../../shared/types'

/**
 * İsteğe bağlı klavye/zil sesleri. Ses dosyası yok: her ses WebAudio ile
 * birkaç milisaniyelik sentezlenmiş bir darbe. Varsayılan kapalı.
 */
type Cue = 'key' | 'enter' | 'bell' | 'error'

let ctx: AudioContext | null = null
let lastKeyAt = 0
const KEY_GAP_MS = 22

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Kısa gürültü darbesi (mekanik tuş). */
function click(ac: AudioContext, freq: number, gain: number, decay: number): void {
  const length = Math.ceil(ac.sampleRate * decay)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq * (0.92 + Math.random() * 0.16)
  filter.Q.value = 1.4
  const amp = ac.createGain()
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start()
}

/** Yumuşak sinüs tonu (zil / soft tema). */
function tone(ac: AudioContext, freq: number, gain: number, duration: number, endFreq = freq): void {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  const now = ac.currentTime
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, now)
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration)
  amp.gain.setValueAtTime(gain, now)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(amp).connect(ac.destination)
  osc.start(now)
  osc.stop(now + duration)
}

export function playCue(theme: SoundTheme, cue: Cue): void {
  if (theme === 'off') return
  if (cue === 'key') {
    const now = performance.now()
    if (now - lastKeyAt < KEY_GAP_MS) return
    lastKeyAt = now
  }
  const ac = audio()
  if (!ac) return
  if (theme === 'mechanical') {
    if (cue === 'key') click(ac, 3200, 0.22, 0.018)
    else if (cue === 'enter') { click(ac, 1400, 0.35, 0.035); click(ac, 3000, 0.12, 0.012) }
    else if (cue === 'bell') tone(ac, 880, 0.08, 0.25, 660)
    else tone(ac, 220, 0.08, 0.18, 150)
    return
  }
  if (cue === 'key') tone(ac, 1500, 0.025, 0.03)
  else if (cue === 'enter') tone(ac, 900, 0.04, 0.06, 700)
  else if (cue === 'bell') tone(ac, 1046, 0.06, 0.35, 1046)
  else tone(ac, 330, 0.05, 0.2, 220)
}

/**
 * Ajan dikkat sesi (agent-attention): tus sesi temasindan bagimsiz, ses seviyesi 0-100.
 * Seni bekliyor = yukselen iki ton, bitti = tek yumusak ton, hata = alcak ton.
 */
export function playAlertTone(kind: 'needs-input' | 'done' | 'error', volume: number): void {
  const ac = audio()
  if (!ac || volume <= 0) return
  const gain = 0.12 * (volume / 100)
  if (kind === 'needs-input') {
    tone(ac, 784, gain, 0.18)
    setTimeout(() => tone(ac, 1175, gain, 0.28), 140)
  } else if (kind === 'done') tone(ac, 988, gain * 0.8, 0.35, 880)
  else tone(ac, 262, gain, 0.3, 196)
}

const decoded = new Map<string, Promise<AudioBuffer | null>>()

/** Kullanicinin sectigi uyari dosyasi; cozulmus hali ayni dosya icin onbellekte. */
export async function playAlertFile(file: string, load: () => Promise<Uint8Array | null>, volume: number): Promise<boolean> {
  const ac = audio()
  if (!ac || volume <= 0) return false
  if (!decoded.has(file)) {
    decoded.set(file, load().then((bytes) => (bytes ? ac.decodeAudioData(bytes.slice().buffer) : null)).catch(() => null))
  }
  const buffer = await decoded.get(file)
  if (!buffer) { decoded.delete(file); return false }
  const src = ac.createBufferSource()
  const amp = ac.createGain()
  src.buffer = buffer
  amp.gain.value = volume / 100
  src.connect(amp).connect(ac.destination)
  src.start()
  return true
}

/** Yeni dosya secilince eski cozulmus sesi birak. */
export function forgetAlertFile(): void {
  decoded.clear()
}
