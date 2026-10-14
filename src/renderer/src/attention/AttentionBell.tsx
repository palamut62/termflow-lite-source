import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import type { TabAttention } from '../../../shared/types'
import { useTerminalStore } from '../store/terminalStore'
import { attentionOrder } from './attentionPolicy'

export const ATTENTION_LABELS: Record<TabAttention, string> = {
  'needs-input': 'Needs your input',
  done: 'Finished, not seen yet',
  error: 'Stopped with an error'
}

/** Sekme cubugunda zil: gorulmemis ajan olaylarinin listesi (agent-attention). */
export function AttentionBell(): React.JSX.Element | null {
  const tabs = useTerminalStore((s) => s.tabs)
  // Sekme cubugu tasmayi kirptigi icin liste pencereye gore sabit konumda acilir.
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const marked = tabs.filter((tab) => tab.attention).sort((a, b) => attentionOrder(a.attention!, b.attention!))

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  useEffect(() => { if (marked.length === 0) setOpen(null) }, [marked.length])
  if (marked.length === 0) return null
  const urgent = marked.some((tab) => tab.attention === 'needs-input')
  const label = `${marked.length} agent ${marked.length === 1 ? 'event' : 'events'} not seen yet`

  return (
    <div className="attention-bell" ref={rootRef}>
      <button className={`split-tab-btn attention-bell-btn${urgent ? ' attention-bell-urgent' : ''}`} onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setOpen((v) => (v ? null : { top: rect.bottom + 4, right: Math.max(4, window.innerWidth - rect.right) }))
      }} title={label} aria-label={label} aria-expanded={Boolean(open)}>
        <Bell size={14} />
        <span className="attention-bell-count">{marked.length}</span>
      </button>
      {open && (
        <div className="attention-bell-menu" role="menu" style={{ top: open.top, right: open.right }}>
          {marked.map((tab) => (
            <button
              key={tab.id}
              className="attention-bell-item"
              role="menuitem"
              onClick={() => { useTerminalStore.getState().setActiveTab(tab.id); useTerminalStore.getState().clearAttention([tab.id]); setOpen(null) }}
            >
              <span className={`tab-attention tab-attention-${tab.attention}`} aria-hidden="true" />
              <span className="attention-bell-title">{tab.title}</span>
              <span className="attention-bell-detail">{tab.agentHook?.detail ?? ATTENTION_LABELS[tab.attention!]}</span>
            </button>
          ))}
          <button className="attention-bell-clear" role="menuitem" onClick={() => { useTerminalStore.getState().clearAttention(marked.map((tab) => tab.id)); setOpen(null) }}>
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
