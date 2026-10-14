import type { AgentEventKind, AgentKind, AgentPermissionMode } from '../../../shared/types'
import type { AgentHookEvent, AgentHookState } from '../../../shared/agentHooks'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'

/** Hook'lu sekmede bu olaylar yalniz ajanin kendi bildiriminden gelir, cikti metninden degil. */
export const HOOK_OWNED_KINDS = new Set<AgentEventKind>(['approval', 'question', 'completed', 'error'])

const INBOX: Partial<Record<AgentHookState, { kind: AgentEventKind; title: string }>> = {
  'needs-input': { kind: 'approval', title: 'Needs your input' },
  done: { kind: 'completed', title: 'Turn finished' },
  error: { kind: 'error', title: 'Turn failed' }
}

export function hasAgentHook(tabId: string): boolean {
  return Boolean(useTerminalStore.getState().tabs.find((tab) => tab.id === tabId)?.agentHook)
}

/** Sekme durumunu gunceller; dikkat isteyen gecisleri Agent Inbox'a yazar. */
export function applyHookEvent(tabId: string, agent: AgentKind, permissionMode: AgentPermissionMode, event: AgentHookEvent): void {
  const store = useTerminalStore.getState()
  if (!store.tabs.some((tab) => tab.id === tabId)) return
  const previous = store.tabs.find((tab) => tab.id === tabId)?.agentHook?.state
  store.applyAgentHook(tabId, event)
  const inbox = event.state && event.state !== previous ? INBOX[event.state] : undefined
  if (inbox) useAgentEventStore.getState().append(tabId, agent, permissionMode, { ...inbox, ...(event.detail ? { detail: event.detail } : {}) })
}

/** Ana surecten gelen Claude hook olaylari; dinlemeyi birakan fonksiyonu dondurur. */
export function subscribeAgentHooks(): () => void {
  return window.termflow.agentHooks.onEvent((tabId, event) => {
    const tab = useTerminalStore.getState().tabs.find((item) => item.id === tabId)
    if (tab) applyHookEvent(tabId, 'claude', tab.permissionMode ?? 'workspace', event)
  })
}
