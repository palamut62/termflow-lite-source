import { redactApiKeys } from './secretRedaction'
import type { AgentKind, TabActivity } from './types'

/**
 * Ajanin kendi bildirdigi durum (spec: docs/orca-parity/agent-hooks.md).
 * Claude Code HTTP hook'larindan, Codex OSC 9 + baslik spinner'indan gelir;
 * cikti metninden tahmin edilmez.
 */
export type AgentHookState = 'idle' | 'working' | 'needs-input' | 'done' | 'error'

export interface AgentHookEvent {
  state?: AgentHookState
  sessionId?: string
  detail?: string
}

const SESSION_ID = /^[\w-]{1,100}$/
const NEEDS_INPUT_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input'])

/** Claude Code'a `--settings` ile verilen hook olaylari. */
// SessionStart HTTP hook desteklemez (yalniz command); oturum kimligi ilk UserPromptSubmit'ten gelir.
export const CLAUDE_HOOK_EVENTS = ['UserPromptSubmit', 'PostToolUse', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure'] as const

/** Uzun ajan metninden ilk anlamli satir: maskeli, kisa. */
export function summaryLine(value: unknown, max = 160): string | undefined {
  if (typeof value !== 'string') return undefined
  const line = value.split(/\r?\n/).map((part) => part.replace(/^[#>*\-\s`]+/, '').trim()).find(Boolean)
  return line ? redactApiKeys(line).slice(0, max) : undefined
}

/** Claude Code hook JSON'u (POST govdesi) -> olay. Bilinmeyen olay null. */
export function claudeHookEvent(raw: unknown): AgentHookEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const sessionId = typeof input.session_id === 'string' && SESSION_ID.test(input.session_id) ? input.session_id : undefined
  const base: AgentHookEvent = sessionId ? { sessionId } : {}
  switch (input.hook_event_name) {
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return { ...base, state: 'working' }
    case 'PermissionRequest':
      return { ...base, state: 'needs-input', detail: typeof input.tool_name === 'string' ? `Approve ${input.tool_name.slice(0, 60)}` : 'Approval needed' }
    case 'Notification':
      return typeof input.notification_type === 'string' && NEEDS_INPUT_NOTIFICATIONS.has(input.notification_type)
        ? { ...base, state: 'needs-input', detail: summaryLine(input.message) }
        : null
    case 'Stop':
      return { ...base, state: 'done', detail: summaryLine(input.last_assistant_message) }
    case 'StopFailure':
      return { ...base, state: 'error', detail: summaryLine(input.error ?? input.message) ?? 'The turn ended with an API error' }
    default:
      return null
  }
}

/** Codex `tui.notification_method=osc9`: tur sonu son mesaji, onay "Approval requested: ..." yazar. */
export function codexOscEvent(payload: string): AgentHookEvent {
  return /^(?:approval requested|codex wants to)/i.test(payload.trim())
    ? { state: 'needs-input', detail: summaryLine(payload) }
    : { state: 'done', detail: summaryLine(payload) }
}

/** Codex calisirken pencere basligini braille spinner ile baslatir. */
export function codexTitleWorking(title: string): boolean {
  return /^[⠁-⣿]/.test(title.trim())
}

/** Hook durumu -> sekme durumu. `running` (surec canli) hook'tan etkilenmez. */
export function hookActivity(state: AgentHookState): TabActivity {
  if (state === 'working') return 'running'
  if (state === 'done') return 'completed'
  if (state === 'error') return 'error'
  return 'waiting'
}

/** Baslatma argumanlari: Claude'a hook ayar dosyasi, Codex'e OSC 9 bildirimleri. */
export function agentHookArgs(agent: AgentKind, args: readonly string[], claudeSettingsPath: string): string[] {
  if (agent === 'claude') return args.includes('--settings') ? [] : ['--settings', claudeSettingsPath]
  if (agent === 'codex') return ['-c', 'tui.notifications=true', '-c', 'tui.notification_method=osc9', '-c', 'tui.notification_condition=always']
  return []
}

/** userData/agent-hooks/claude-settings.json icerigi; token ve sekme env'den gelir, dosyada sir yok. */
export function claudeHookSettings(url: string): { hooks: Record<string, unknown[]> } {
  const hook = {
    type: 'http',
    url,
    timeout: 5,
    headers: { 'x-termflow-token': '$TERMFLOW_HOOK_TOKEN', 'x-termflow-tab': '$TERMFLOW_TAB_ID' },
    allowedEnvVars: ['TERMFLOW_HOOK_TOKEN', 'TERMFLOW_TAB_ID']
  }
  return { hooks: Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [hook] }]])) }
}
