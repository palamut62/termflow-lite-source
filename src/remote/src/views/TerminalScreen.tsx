import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, Keyboard, Minus, Plus, Send, SquareTerminal } from 'lucide-react'
import { resolveTheme } from '../../../renderer/src/themes/themes'
import type { RemoteTab, ServerMessage } from '../../../shared/remote'
import { client, errorText, useRemote } from '../store'
import { profileColor } from '../profiles'
import { Confirm, Empty, Sheet, TextField } from '../ui'
import { NewTabSheet } from './NewTabSheet'

const FONT_KEY = 'termflow.remote.fontSize'
const KEYBOARD_KEY = 'termflow.remote.directKeyboard'
const RESIZE_DEBOUNCE_MS = 120

function storedNumber(key: string, fallback: number): number {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const ACTIVITY_LABEL: Record<RemoteTab['activity'], string> = {
  running: 'Running',
  waiting: 'Waiting for input',
  unread: 'New output',
  completed: 'Finished',
  error: 'Failed'
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(document.visibilityState === 'visible')
  useEffect(() => {
    const on = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

export function TerminalScreen(): React.JSX.Element {
  const tabs = useRemote((s) => s.tabs)
  const currentTabId = useRemote((s) => s.currentTabId)
  const setCurrentTab = useRemote((s) => s.setCurrentTab)
  const connection = useRemote((s) => s.connection)
  const settings = useRemote((s) => s.settings)
  const shells = useRemote((s) => s.shells)
  const toast = useRemote((s) => s.toast)
  const pageVisible = usePageVisible()

  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const tabRef = useRef<string | null>(null)
  const modRef = useRef<{ ctrl: boolean; alt: boolean }>({ ctrl: false, alt: false })
  const keyboardRef = useRef(localStorage.getItem(KEYBOARD_KEY) === '1')
  const [mods, setMods] = useState({ ctrl: false, alt: false })
  const [fontSize, setFontSize] = useState(() => storedNumber(FONT_KEY, 12))
  const [directKeyboard, setDirectKeyboard] = useState(keyboardRef.current)
  const [exited, setExited] = useState<number | null>(null)
  const [newTabOpen, setNewTabOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [compose, setCompose] = useState('')

  const current = tabs.find((t) => t.id === currentTabId) ?? null

  /** Every keystroke from the phone goes through here (xterm, key bar, compose). */
  const sendInput = useCallback((data: string, raw = false): void => {
    const tabId = tabRef.current
    if (!tabId) return
    let out = data
    if (!raw) {
      const { ctrl, alt } = modRef.current
      if (ctrl && data.length === 1) {
        const code = data.toUpperCase().charCodeAt(0)
        if (code >= 64 && code <= 95) out = String.fromCharCode(code - 64)
        else if (data === ' ') out = '\x00'
      }
      if (alt) out = `\x1b${out}`
      if (ctrl || alt) {
        modRef.current = { ctrl: false, alt: false }
        setMods({ ctrl: false, alt: false })
      }
    }
    if (!useRemote.getState().client?.send({ t: 'input', tabId, data: out })) toast('Not connected to the desktop.', 'error')
  }, [toast])

  // ---- One xterm for the whole session; tabs swap their content into it ----
  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "Roboto Mono", monospace',
      fontSize,
      scrollback: 5000,
      cursorBlink: true,
      allowProposedApi: true,
      macOptionIsMeta: true,
      smoothScrollDuration: 0
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener,noreferrer')))
    term.open(hostRef.current!)
    termRef.current = term
    fitRef.current = fit
    const dataSub = term.onData((data) => sendInput(data))
    // Compose mode: tapping the terminal must not pop the keyboard up.
    const textarea = term.textarea
    const onFocus = (): void => { if (!keyboardRef.current) textarea?.blur() }
    textarea?.addEventListener('focus', onFocus)
    if (textarea) {
      textarea.setAttribute('autocapitalize', 'off')
      textarea.setAttribute('autocorrect', 'off')
      textarea.setAttribute('spellcheck', 'false')
    }
    try { fit.fit() } catch { /* hidden */ }
    return () => {
      textarea?.removeEventListener('focus', onFocus)
      dataSub.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Desktop theme and cursor settings follow along.
  useEffect(() => {
    const term = termRef.current
    if (!term || !settings) return
    const colors = resolveTheme(settings).colors
    term.options.theme = { ...colors, cursor: settings.cursorColor || colors.cursor, selectionBackground: colors.selection }
    term.options.cursorStyle = settings.cursorStyle
    document.documentElement.style.setProperty('--term-bg', colors.background)
  }, [settings])

  const sendSize = useCallback((): void => {
    const term = termRef.current
    const tabId = tabRef.current
    if (!term || !tabId) return
    useRemote.getState().client?.send({ t: 'resize', tabId, cols: term.cols, rows: term.rows })
  }, [])

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontSize))
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    try { fitRef.current?.fit() } catch { /* hidden */ }
    sendSize()
  }, [fontSize, sendSize])

  // Refit on every layout change (rotation, keyboard, compose growing).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const term = termRef.current
        if (!term || host.clientWidth === 0) return
        const before = `${term.cols}x${term.rows}`
        try { fitRef.current?.fit() } catch { return }
        if (`${term.cols}x${term.rows}` !== before) sendSize()
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(host)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [sendSize])

  // ---- Subscription: live while this tab is on screen and the app is visible ----
  useEffect(() => {
    const term = termRef.current
    const remote = useRemote.getState().client
    if (!term || !remote || !currentTabId || connection !== 'online' || !pageVisible) {
      tabRef.current = currentTabId
      return
    }
    tabRef.current = currentTabId
    setExited(null)
    term.reset()
    try { fitRef.current?.fit() } catch { /* hidden */ }
    const off = remote.onMessage((message: ServerMessage) => {
      if (!('tabId' in message) || message.tabId !== currentTabId) return
      if (message.t === 'snapshot') {
        term.reset()
        term.write(message.data, () => term.scrollToBottom())
      } else if (message.t === 'data') {
        term.write(message.data)
      } else if (message.t === 'exit') {
        setExited(message.exitCode)
      }
    })
    remote.send({ t: 'sub', tabId: currentTabId, cols: term.cols, rows: term.rows })
    return () => {
      off()
      remote.send({ t: 'unsub', tabId: currentTabId })
    }
  }, [currentTabId, connection, pageVisible])

  const toggleMod = (mod: 'ctrl' | 'alt'): void => {
    modRef.current = { ...modRef.current, [mod]: !modRef.current[mod] }
    setMods({ ...modRef.current })
  }

  const toggleKeyboard = (): void => {
    const next = !keyboardRef.current
    keyboardRef.current = next
    setDirectKeyboard(next)
    localStorage.setItem(KEYBOARD_KEY, next ? '1' : '0')
    if (next) termRef.current?.focus()
    else termRef.current?.textarea?.blur()
  }

  const arrow = (key: 'A' | 'B' | 'C' | 'D'): void => {
    const app = termRef.current?.modes.applicationCursorKeysMode
    sendInput(app ? `\x1bO${key}` : `\x1b[${key}`, true)
  }

  const submitCompose = (): void => {
    const text = compose
    // paste() honours bracketed paste, so multi-line prompts arrive as one block.
    if (text) termRef.current?.paste(text)
    sendInput('\r', true)
    setCompose('')
  }

  const run = async (method: string, params: object, done?: string): Promise<void> => {
    try {
      await client().call(method, params)
      if (done) toast(done)
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  return (
    <div className="terminal-screen">
      <div className="tab-strip" role="tablist" aria-label="Desktop tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === currentTabId}
            className={tab.id === currentTabId ? 'tab-chip active' : 'tab-chip'}
            onClick={() => (tab.id === currentTabId ? setMenuOpen(true) : setCurrentTab(tab.id))}
            title={ACTIVITY_LABEL[tab.activity]}
          >
            <span className={`dot ${tab.activity}`} style={{ background: tab.activity === 'running' ? profileColor(settings, shells, tab.profileId) : undefined }} />
            <span className="tab-chip-title">{tab.title}</span>
          </button>
        ))}
        <button className="tab-chip add" onClick={() => setNewTabOpen(true)} aria-label="New tab"><Plus size={16} /></button>
      </div>

      <div className="term-wrap">
        <div ref={hostRef} className="term-host" />
        {!current && tabs.length === 0 && (
          <div className="term-overlay">
            <Empty icon={<SquareTerminal size={28} />} title="No tabs open" text="Open a shell or an agent on your computer.">
              <button className="btn primary" onClick={() => setNewTabOpen(true)}>Open a tab</button>
            </Empty>
          </div>
        )}
        {connection !== 'online' && current && (
          <div className="term-banner">{connection === 'connecting' ? 'Connecting...' : 'Offline. Reconnecting...'}</div>
        )}
        {exited !== null && current && (
          <div className="term-banner exit">
            Process exited with code {exited}
            <button className="btn small" onClick={() => void run('tab.restart', { tabId: current.id })}>Restart</button>
          </div>
        )}
      </div>

      <div className="keybar" role="toolbar" aria-label="Special keys">
        <button className={directKeyboard ? 'key on' : 'key'} onClick={toggleKeyboard} aria-label="Type directly in the terminal" aria-pressed={directKeyboard}><Keyboard size={16} /></button>
        <button className="key" onClick={() => sendInput('\x1b', true)}>Esc</button>
        <button className="key" onClick={() => sendInput('\t', true)}>Tab</button>
        <button className="key" onClick={() => sendInput('\x1b[Z', true)} aria-label="Shift Tab">⇧Tab</button>
        <button className={mods.ctrl ? 'key on' : 'key'} onClick={() => toggleMod('ctrl')} aria-pressed={mods.ctrl}>Ctrl</button>
        <button className={mods.alt ? 'key on' : 'key'} onClick={() => toggleMod('alt')} aria-pressed={mods.alt}>Alt</button>
        <button className="key" onClick={() => arrow('D')} aria-label="Left"><ArrowLeft size={16} /></button>
        <button className="key" onClick={() => arrow('A')} aria-label="Up"><ArrowUp size={16} /></button>
        <button className="key" onClick={() => arrow('B')} aria-label="Down"><ArrowDown size={16} /></button>
        <button className="key" onClick={() => arrow('C')} aria-label="Right"><ArrowRight size={16} /></button>
        <button className="key" onClick={() => sendInput('\x03', true)} aria-label="Control C">^C</button>
        <button className="key" onClick={() => sendInput('\x04', true)} aria-label="Control D">^D</button>
        <button className="key" onClick={() => sendInput('\x1b[5~', true)} aria-label="Page up">PgUp</button>
        <button className="key" onClick={() => sendInput('\x1b[6~', true)} aria-label="Page down">PgDn</button>
        {['/', '|', '~', '-', '*'].map((ch) => <button key={ch} className="key" onClick={() => sendInput(ch)}>{ch}</button>)}
      </div>

      {!directKeyboard && (
        <form className="compose" onSubmit={(e) => { e.preventDefault(); submitCompose() }}>
          <textarea
            className="compose-input"
            rows={1}
            value={compose}
            placeholder={current ? `Message ${current.title}` : 'Open a tab first'}
            disabled={!current}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            onChange={(e) => setCompose(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitCompose()
              }
            }}
          />
          <button className="send" type="submit" disabled={!current} aria-label={compose ? 'Send' : 'Press Enter'}>
            {compose ? <Send size={18} /> : <CornerDownLeft size={18} />}
          </button>
        </form>
      )}

      {newTabOpen && <NewTabSheet onClose={() => setNewTabOpen(false)} />}

      {menuOpen && current && (
        <Sheet title={current.title} onClose={() => { setMenuOpen(false); setRenaming(false) }}>
          <div className="menu-meta">
            <span>{ACTIVITY_LABEL[current.activity]}</span>
            {current.cwd && <span className="mono">{current.cwd}</span>}
            {current.model && <span>Model: {current.model}</span>}
            {current.worktree && <span>Worktree: {current.worktree.branch}</span>}
          </div>
          {renaming
            ? (
              <div className="menu-rename">
                <TextField label="Tab name" value={current.title} onCommit={(title) => { void run('tab.rename', { tabId: current.id, title }); setRenaming(false) }} />
              </div>
            )
            : (
              <div className="menu-list">
                <button className="menu-item" onClick={() => setRenaming(true)}>Rename</button>
                <button className="menu-item" onClick={() => { setMenuOpen(false); void run('tab.focus', { tabId: current.id }, 'Shown on the desktop.') }}>Show on desktop</button>
                <button className="menu-item" onClick={() => { setMenuOpen(false); void run('tab.restart', { tabId: current.id }) }}>Restart</button>
                <div className="menu-item font-size">
                  <span>Text size</span>
                  <span className="stepper">
                    <button className="icon-btn" onClick={() => setFontSize((n) => Math.max(8, n - 1))} aria-label="Smaller text"><Minus size={16} /></button>
                    <span>{fontSize}</span>
                    <button className="icon-btn" onClick={() => setFontSize((n) => Math.min(24, n + 1))} aria-label="Larger text"><Plus size={16} /></button>
                  </span>
                </div>
                <button className="menu-item danger" onClick={() => { setMenuOpen(false); setConfirmClose(true) }}>Close tab</button>
              </div>
            )}
        </Sheet>
      )}
      {confirmClose && current && (
        <Confirm
          title="Close this tab?"
          text={`"${current.title}" will be closed on your computer and its process stops.`}
          confirmLabel="Close tab"
          danger
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => { setConfirmClose(false); void run('tab.close', { tabId: current.id }) }}
        />
      )}
    </div>
  )
}
