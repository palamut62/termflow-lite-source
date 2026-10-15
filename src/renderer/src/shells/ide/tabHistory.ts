import { useTerminalStore } from '../../store/terminalStore'

/**
 * Geri/ileri (Orca sol ust oklari): aktif sekme gecmisi. Kapanan sekmeler atlanir.
 * Saf kisim (`pushHistory`) testli; abonelik startTabHistory ile.
 */
export interface TabHistory { stack: string[]; index: number }

export function pushHistory(history: TabHistory, id: string, limit = 50): TabHistory {
  if (history.stack[history.index] === id) return history
  const stack = [...history.stack.slice(0, history.index + 1), id].slice(-limit)
  return { stack, index: stack.length - 1 }
}

export function step(history: TabHistory, delta: -1 | 1, alive: (id: string) => boolean): TabHistory | null {
  for (let i = history.index + delta; i >= 0 && i < history.stack.length; i += delta) {
    if (alive(history.stack[i])) return { stack: history.stack, index: i }
  }
  return null
}

let history: TabHistory = { stack: [], index: -1 }
let navigating = false
const listeners = new Set<() => void>()

export function canGo(delta: -1 | 1): boolean {
  const ids = new Set(useTerminalStore.getState().tabs.map((t) => t.id))
  return step(history, delta, (id) => ids.has(id)) !== null
}

export function go(delta: -1 | 1): void {
  const ids = new Set(useTerminalStore.getState().tabs.map((t) => t.id))
  const next = step(history, delta, (id) => ids.has(id))
  if (!next) return
  history = next
  navigating = true
  useTerminalStore.getState().setActiveTab(next.stack[next.index])
  navigating = false
  listeners.forEach((fn) => fn())
}

export function onHistoryChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function startTabHistory(): () => void {
  const record = (id: string | null): void => {
    if (!id || navigating) return
    history = pushHistory(history, id)
    listeners.forEach((fn) => fn())
  }
  record(useTerminalStore.getState().activeTabId)
  return useTerminalStore.subscribe((state, previous) => {
    if (state.activeTabId !== previous.activeTabId) record(state.activeTabId)
    else if (state.tabs !== previous.tabs) listeners.forEach((fn) => fn())
  })
}
