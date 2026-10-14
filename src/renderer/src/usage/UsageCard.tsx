import { Gauge } from 'lucide-react'
import { formatResetIn, liveWindows, usageLevel } from '../../../shared/usage'
import { agentForProfile } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { percentText, useAgentUsage } from './UsageMeter'

const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' } as const

/** Terminalin sag ustunde aktif ajanin 5 saatlik / haftalik limitleri: kart basina bir pencere, renk seviyeye gore. */
export function UsageCard(): React.JSX.Element | null {
  const settings = useSettingsStore((s) => s.settings)
  const profileId = useTerminalStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.profileId)
  const [usage] = useAgentUsage(settings.usageDisplay !== 'off' && settings.usageCard)
  const mode = settings.usageDisplay
  if (mode === 'off' || !settings.usageCard || !profileId) return null
  const agent = agentForProfile(settings, profileId)
  const now = Date.now()
  const windows = liveWindows(usage.find((u) => u.agent === agent)?.windows ?? [], now)
  if (!agent || windows.length === 0) return null
  return (
    <div className="usage-cards" role="group" aria-label={`${AGENT_NAMES[agent]} limits`}>
      {windows.map((w) => {
        const level = usageLevel(w.usedPercent)
        return (
          <div key={w.label} className={`usage-card usage-card-${level}`}>
            <div className="usage-card-head"><Gauge size={11} />{AGENT_NAMES[agent]} · {w.label}</div>
            <div className="usage-card-value">{percentText(w, mode)}</div>
            <span className="usage-bar" aria-hidden="true"><span className={`usage-fill usage-${level}`} style={{ width: `${Math.round(w.usedPercent)}%` }} /></span>
            <div className="usage-card-reset">resets in {formatResetIn(w.resetsAt, now)}</div>
          </div>
        )
      })}
    </div>
  )
}
