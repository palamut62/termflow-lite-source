import { useEffect, useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import type { AgentKind } from '../../../shared/types'
import { formatResetIn, liveWindows, usageLevel, type AgentUsage, type UsageWindow } from '../../../shared/usage'
import { agentForProfile } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'

const AGENT_NAMES: Record<AgentKind, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' }
const REFRESH_MS = 30_000

/** Yerel dosyalardan okunan limitler; 30 sn'de bir ve pencere odak alinca yenilenir. */
export function useAgentUsage(enabled: boolean): [AgentUsage[], () => void] {
  const [usage, setUsage] = useState<AgentUsage[]>([])
  const refresh = (): void => { void window.termflow.usage.get().then(setUsage).catch(() => undefined) }
  useEffect(() => {
    if (!enabled) return
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [enabled])
  return [usage, refresh]
}

export function percentText(w: UsageWindow, mode: 'used' | 'remaining'): string {
  return mode === 'used' ? `${Math.round(w.usedPercent)}%` : `${Math.round(100 - w.usedPercent)}% left`
}

/** usage-meter (docs/orca-parity/usage-meter.md): aktif ajan sekmesinin limitleri, tiklayinca hepsi. */
export function UsageMeter(): React.JSX.Element | null {
  const mode = useSettingsStore((s) => s.settings.usageDisplay)
  const settings = useSettingsStore((s) => s.settings)
  const activeProfile = useTerminalStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.profileId)
  const [usage, refresh] = useAgentUsage(mode !== 'off')
  const [open, setOpen] = useState<{ bottom: number; right: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)

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

  if (mode === 'off') return null
  const now = Date.now()
  const agent = activeProfile ? agentForProfile(settings, activeProfile) : null
  const current = usage.find((u) => u.agent === agent)
  const windows = current ? liveWindows(current.windows, now) : []
  // Limit kaynagi olan ajanlar (Claude, Codex) veri gelmeden de gorunur; yoksa neden belli olmaz.
  if (!agent || (windows.length === 0 && agent !== 'claude' && agent !== 'codex')) return null
  // Serit gorunurken ayni bilgi durum cubugunda tekrarlanmaz (yer tutucu ve diger ajanlar icin kalir).
  if (windows.length > 0 && settings.usageCard) return null
  const level = windows.length ? usageLevel(windows[0].usedPercent) : 'ok'
  const title = windows.length === 0 ? (agent === 'claude' && !settings.claudeUsage ? 'Turn on "Claude limits" in Settings > Agent Security' : 'Appears after the first reply of this session') : windows.map((w) => `${w.label}: ${Math.round(w.usedPercent)}% used, resets in ${formatResetIn(w.resetsAt, now)}`).join('\n')

  return (
    <span className="usage-meter" ref={rootRef}>
      <button
        className={`status-item status-action usage-meter-btn usage-${level}`}
        title={`${AGENT_NAMES[agent]} limits\n${title}`}
        aria-label={`${AGENT_NAMES[agent]} limits. ${title}`}
        aria-expanded={Boolean(open)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          refresh()
          setOpen((v) => (v ? null : { bottom: window.innerHeight - rect.top + 4, right: Math.max(4, window.innerWidth - rect.right) }))
        }}
      >
        <Gauge size={12} />
        {windows.length ? windows.map((w) => `${w.label} ${percentText(w, mode)}`).join(' · ') : 'Limits'}
      </button>
      {open && (
        <div className="usage-popover" role="dialog" aria-label="Agent usage" style={{ bottom: open.bottom, right: open.right }}>
          {agent && !current && <div className="usage-agent"><div className="usage-agent-name">{AGENT_NAMES[agent]}</div><div className="usage-note">{agent === 'claude' && !settings.claudeUsage ? 'Turn on "Claude limits" in Settings > Agent Security (Pro/Max).' : 'No limit data yet. It appears after the first reply of a session.'}</div></div>}
          {[...usage].sort((a, b) => Number(b.agent === agent) - Number(a.agent === agent)).map((u) => {
            const live = liveWindows(u.windows, now)
            return (
              <div key={u.agent} className="usage-agent">
                <div className="usage-agent-name">{AGENT_NAMES[u.agent]}</div>
                {live.length === 0 && <div className="usage-note">No current limit window</div>}
                {live.map((w) => (
                  <div key={w.label} className="usage-row">
                    <span className="usage-label">{w.label}</span>
                    <span className="usage-bar" aria-hidden="true"><span className={`usage-fill usage-${usageLevel(w.usedPercent)}`} style={{ width: `${Math.round(w.usedPercent)}%` }} /></span>
                    <span className="usage-value">{percentText(w, mode)}</span>
                    <span className="usage-reset">resets in {formatResetIn(w.resetsAt, now)}</span>
                  </div>
                ))}
                <div className="usage-note">Updated {formatResetIn(now + (now - u.updatedAt), now)} ago</div>
              </div>
            )
          })}
          {agent !== 'claude' && !usage.some((u) => u.agent === 'claude') && (
            <div className="usage-note">
              {settings.claudeUsage
                ? 'Claude limits appear after the first reply in a new Claude Code tab (Pro/Max).'
                : 'Claude limits: turn on "Claude limits" in Settings > Agent Security (Pro/Max).'}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
