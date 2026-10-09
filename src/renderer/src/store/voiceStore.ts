import { create } from 'zustand'

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing'

interface VoiceState {
  phase: VoicePhase
  /** Tab the text will go to. */
  tabId: string | null
  startedAt: number
  /** Microphone loudness 0..1 for the meter. */
  level: number
  set(patch: Partial<Omit<VoiceState, 'set'>>): void
}

/** What the dictation indicator shows; driven by voice/voiceInput.ts. */
export const useVoiceStore = create<VoiceState>()((set) => ({
  phase: 'idle',
  tabId: null,
  startedAt: 0,
  level: 0,
  set: (patch) => set(patch)
}))
