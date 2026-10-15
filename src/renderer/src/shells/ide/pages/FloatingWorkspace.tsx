import { useRef, useState } from 'react'
import { AppWindow, Minus, PanelBottom, SquareTerminal, X } from 'lucide-react'
import { resolveDefaultProfileId, useSettingsStore } from '../../../store/settingsStore'
import { useTerminalStore } from '../../../store/terminalStore'
import { TerminalView } from '../../../terminal/TerminalView'

const NOTE_KEY = 'termflow.ide.floating-note'

/**
 * Floating Workspace (PRD F3.3, Orca): pencere icinde tasinir, boyutlanir panel; not ve tek terminal.
 * Terminal siradan bir sekmedir (`floatingTabId`): ana alanda cizilmez, sekme seridinden ya da "Dock"
 * ile ana alana doner. Panel kucultulunce PTY yasamaya devam eder.
 */
export function FloatingWorkspace(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'terminal' | 'note'>('note')
  const [pos, setPos] = useState({ right: 24, bottom: 48 })
  const [note, setNote] = useState(() => localStorage.getItem(NOTE_KEY) ?? '')
  const drag = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null)
  const floatingTabId = useTerminalStore((s) => s.floatingTabId)
  const floatingTitle = useTerminalStore((s) => s.tabs.find((t) => t.id === s.floatingTabId)?.title)

  const saveNote = (value: string): void => {
    setNote(value)
    try { localStorage.setItem(NOTE_KEY, value) } catch { /* depolama yoksa not oturumla sinirli */ }
  }
  const onPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { x: e.clientX, y: e.clientY, ...pos }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    const start = drag.current
    if (!start) return
    // Pencereden tasmasin: baslik her zaman tutulabilir kalir.
    setPos({
      right: Math.max(0, Math.min(window.innerWidth - 120, start.right - (e.clientX - start.x))),
      bottom: Math.max(0, Math.min(window.innerHeight - 60, start.bottom - (e.clientY - start.y)))
    })
  }
  const newTerminal = (): void => {
    const store = useTerminalStore.getState()
    if (!store.floatingTabId) {
      const { settings, shells } = useSettingsStore.getState()
      store.setFloatingTab(store.addTab(resolveDefaultProfileId(settings, shells), false))
    }
    setView('terminal')
  }
  const dock = (): void => {
    if (floatingTabId) useTerminalStore.getState().setActiveTab(floatingTabId)
    setView('note')
  }

  if (!open) {
    return (
      <button className="ide-floating-btn" onClick={() => setOpen(true)} title="Floating workspace" aria-label="Open floating workspace">
        <AppWindow size={16} />
      </button>
    )
  }
  const showTerminal = view === 'terminal' && floatingTabId
  return (
    <section className={`ide-floating${showTerminal ? ' ide-floating-terminal' : ''}`} style={{ right: pos.right, bottom: pos.bottom }} aria-label="Floating workspace">
      <header onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null }}>
        <div className="ide-segment" role="radiogroup" aria-label="Floating view">
          <button role="radio" aria-checked={view === 'note'} className={view === 'note' ? 'ide-segment-on' : ''} onClick={() => setView('note')}>Note</button>
          <button role="radio" aria-checked={Boolean(showTerminal)} className={showTerminal ? 'ide-segment-on' : ''} onClick={newTerminal} title={floatingTabId ? floatingTitle : 'Open a terminal in this panel'}>Terminal</button>
        </div>
        <span className="ide-floating-spacer" />
        {floatingTabId
          ? <button className="ide-icon-btn" onClick={dock} title="Move the terminal to the tabs" aria-label="Dock terminal to tabs"><PanelBottom size={14} /></button>
          : <button className="ide-icon-btn" onClick={newTerminal} title="New terminal in this panel" aria-label="New floating terminal"><SquareTerminal size={14} /></button>}
        {floatingTabId && <button className="ide-icon-btn" onClick={() => { useTerminalStore.getState().requestCloseTab(floatingTabId); setView('note') }} title="Close the floating terminal" aria-label="Close floating terminal"><X size={14} /></button>}
        <button className="ide-icon-btn" onClick={() => setOpen(false)} title="Minimize" aria-label="Minimize floating workspace"><Minus size={14} /></button>
      </header>
      {showTerminal
        ? <div className="ide-floating-term"><TerminalView key={floatingTabId} tabId={floatingTabId} active visible /></div>
        : <textarea value={note} onChange={(e) => saveNote(e.target.value)} placeholder="Scratch notes (Markdown). Saved on this computer." aria-label="Floating workspace note" spellCheck={false} />}
    </section>
  )
}
