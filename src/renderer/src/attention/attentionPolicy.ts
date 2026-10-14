import type { AgentAlertSettings, AgentKind, TabAttention } from '../../../shared/types'

/** Spec: docs/orca-parity/agent-attention.md. Hangi olay hangi kanali tetikler. */
export interface AlertDecision {
  /** Sekmede / zilde okunmadi isareti. */
  mark: boolean
  notify: boolean
  sound: boolean
}

export function alertDecision(kind: TabAttention, visible: boolean, focused: boolean, settings: AgentAlertSettings): AlertDecision {
  const channel = kind === 'needs-input' ? settings.needsInput : kind === 'done' ? settings.done : settings.error
  const unseen = !visible || !focused
  return { mark: unseen, notify: unseen && channel.system, sound: channel.sound }
}

const AGENT_NAMES: Record<AgentKind, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' }

export function alertTitle(agent: AgentKind, kind: TabAttention): string {
  const name = AGENT_NAMES[agent]
  if (kind === 'needs-input') return `${name} needs you`
  if (kind === 'done') return `${name} finished`
  return `${name} stopped with an error`
}

/** Gorev cubugu rozeti ve zil sirasi: once seni bekleyenler. */
const ORDER: Record<TabAttention, number> = { 'needs-input': 0, error: 1, done: 2 }

export function attentionOrder(a: TabAttention, b: TabAttention): number {
  return ORDER[a] - ORDER[b]
}

/** Ses dosyasi: yalniz izinli uzantilar, en fazla 5 MB. */
export const SOUND_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] as const
export const MAX_SOUND_BYTES = 5 * 1024 * 1024
