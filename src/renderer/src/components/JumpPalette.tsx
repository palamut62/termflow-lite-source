import { useEffect, useMemo, useState } from 'react'
import { FolderPlus, Search } from 'lucide-react'
import type { AgentSession } from '../../../shared/types'
import { idleTabs, searchJump, type JumpItem } from '../jumpRanking'
import { pathLabel } from '../sessionRail'
import { lastSeen, useJumpPaletteStore } from '../store/jumpPaletteStore'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useToastStore } from '../store/toastStore'
import { agentProfileOptions, continueAgentSession } from '../agentHandover'
import { ATTENTION_LABELS } from '../attention/AttentionBell'
import { TabIcon } from '../tabs/TabIcon'
import { relativeTime } from './AgentSessions'

/** Ctrl+Shift+J: sekme ve oturum atlama. Spec: docs/orca-parity/jump-palette.md */
export function JumpPalette(): React.JSX.Element {
  const hide = useJumpPaletteStore((s) => s.hide)
  const tabs = useTerminalStore((s) => s.tabs)
  const active = useTerminalStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId))
  // Acilis anindaki sira dondurulur; acikken gelen yeni olay satirlarin yerini degistirmez.
  const [frozen] = useState(() => idleTabs(useTerminalStore.getState().tabs, useTerminalStore.getState().activeTabId, lastSeen))
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [folder, setFolder] = useState<string | null>(null)
  const cwd = active?.cwd || active?.launchCwd || ''

  useEffect(() => {
    void window.termflow.agentSessions.list({ limit: 50 }).then(setSessions).catch(() => undefined)
  }, [])

  const items = useMemo<JumpItem[]>(() => query.trim()
    ? searchJump(query, tabs, sessions, lastSeen)
    : frozen.flatMap((item) => {
      // Kapanan sekme duser; kalanlar guncel baslik ve noktayla gorunur.
      const tab = item.kind === 'tab' ? tabs.find((t) => t.id === item.tab.id) : undefined
      return tab ? [{ kind: 'tab' as const, tab, at: item.at }] : []
    }), [query, tabs, sessions, frozen])

  // Hicbir sey eslesmezse ve sorgu var olan bir klasorse: "Open new tab in <klasor>".
  useEffect(() => {
    setFolder(null)
    const q = query.trim()
    if (!q || items.length > 0 || (!cwd && !/^([a-z]:|[\\/~])/i.test(q))) return
    let current = true
    void window.termflow.system.resolvePath(q, cwd).then((resolved) => {
      if (current && resolved?.isDirectory) setFolder(resolved.path)
    })
    return () => { current = false }
  }, [query, items.length, cwd])

  useEffect(() => setSelected(0), [query])
  useEffect(() => document.getElementById(`jump-row-${selected}`)?.scrollIntoView({ block: 'nearest' }), [selected])

  const count = items.length + (folder ? 1 : 0)

  const choose = (index: number, beside: boolean): void => {
    const item = items[index]
    if (!item && !(folder && index === items.length)) return
    hide()
    const store = useTerminalStore.getState()
    const { settings, shells } = useSettingsStore.getState()
    if (!item) {
      store.addTab(resolveDefaultProfileId(settings, shells), true, folder!)
    } else if (item.kind === 'tab') {
      if (beside) store.openBeside(item.tab.id)
      else store.setActiveTab(item.tab.id)
      store.clearAttention([item.tab.id])
    } else {
      const profiles = agentProfileOptions(settings)
      const target = profiles.find((p) => p.id === item.session.profileId) ?? profiles.find((p) => p.agent === item.session.agent)
      if (!target) {
        useToastStore.getState().show(`No ${item.session.agent} profile to resume this session with.`, 'error')
        return
      }
      void continueAgentSession(item.session, target, item.session.cwd, settings.defaultAgentPermissionMode)
        .catch(() => useToastStore.getState().show('Session could not be resumed.', 'error'))
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // Rakam bos sorguda (Ctrl ile her zaman) o satira atlar.
    if (/^[1-9]$/.test(event.key) && (event.ctrlKey || !query)) {
      event.preventDefault()
      choose(Number(event.key) - 1, false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((value) => Math.min(value + 1, count - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((value) => Math.max(value - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(selected, event.shiftKey)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      hide()
    }
  }

  const row = (index: number, label: string, content: React.ReactNode): React.JSX.Element => (
    <div
      key={index}
      id={`jump-row-${index}`}
      role="option"
      aria-selected={selected === index}
      aria-label={label}
      className={`palette-item jump-item${selected === index ? ' palette-item-selected' : ''}`}
      onMouseEnter={() => setSelected(index)}
      onClick={(event) => choose(index, event.shiftKey)}
    >
      <kbd className="jump-key">{!query && index < 9 ? index + 1 : ''}</kbd>
      {content}
    </div>
  )

  return (
    <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) hide() }}>
      <section className="task-palette" role="dialog" aria-label="Jump to tab or session">
        <label className="palette-search">
          <Search size={15} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a tab, folder, branch or session..."
            role="combobox"
            aria-expanded="true"
            aria-controls="jump-list"
            aria-autocomplete="list"
            aria-activedescendant={count > 0 ? `jump-row-${selected}` : undefined}
          />
        </label>
        <div className="palette-results" id="jump-list" role="listbox" aria-label="Tabs and sessions">
          {count === 0 && <div className="palette-empty">{query.trim() ? 'No matching tabs or sessions' : 'No other tabs open'}</div>}
          {items.map((item, index) => {
            if (item.kind === 'tab') {
              const { tab } = item
              const where = tab.worktree?.branch ?? tab.cwd ?? tab.launchCwd ?? ''
              const status = tab.attention ? ATTENTION_LABELS[tab.attention] : ''
              return row(index, [tab.title, status, where].filter(Boolean).join(', '), <>
                <span className={tab.attention ? `tab-attention tab-attention-${tab.attention}` : 'jump-dot'} aria-hidden="true" />
                <TabIcon shellId={tab.profileId} />
                <span><strong>{tab.title}</strong><small title={where}>{where}</small></span>
                <time>{relativeTime(item.at)}</time>
              </>)
            }
            const { session } = item
            return row(index, `Resume ${session.agent} session ${session.title}, ${session.cwd ?? ''}`, <>
              <span className="jump-dot" aria-hidden="true" />
              <TabIcon shellId={session.profileId ?? session.agent} />
              <span><strong>{session.title}</strong><small title={session.cwd}>Resume · {session.cwd ? pathLabel(session.cwd) : 'Unknown folder'}</small></span>
              <time>{relativeTime(item.at)}</time>
            </>)
          })}
          {folder && row(items.length, `Open new tab in ${folder}`, <>
            <span className="jump-dot" aria-hidden="true" />
            <FolderPlus size={14} />
            <span><strong>Open new tab in {pathLabel(folder)}</strong><small title={folder}>{folder}</small></span>
            <time />
          </>)}
        </div>
        <footer className="palette-hint"><span>1-9 Jump</span><span>Enter Open</span><span>Shift+Enter Split</span><span>Esc Close</span></footer>
      </section>
    </div>
  )
}
