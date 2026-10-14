import { formatResetIn, liveWindows, usageLevel } from '../../../shared/usage'
import { agentForProfile } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { percentText, useAgentUsage } from './UsageMeter'

const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' } as const

/**
 * Terminalin altinda (is paneli ustunde) tek satirlik serit: aktif ajanin 5 saatlik ve haftalik limiti
 * yan yana. Kendi satiri oldugu icin metnin ustune binmez; renkler terminal temasindan gelir.
 */
export function UsageStrip({ tabId }: { tabId: string }): React.JSX.Element | null {
  const settings = useSettingsStore((s) => s.settings)
  const profileId = useTerminalStore((s) => s.tabs.find((t) => t.id === tabId)?.profileId)
  const mode = settings.usageDisplay
  const [usage] = useAgentUsage(mode !== 'off' && settings.usageCard)
  if (mode === 'off' || !settings.usageCard || !profileId) return null
  const agent = agentForProfile(settings, profileId)
  const now = Date.now()
  const windows = liveWindows(usage.find((u) => u.agent === agent)?.windows ?? [], now)
  if (!agent || windows.length === 0) return null
  return (
    <div className="usage-strip" role="group" aria-label={`${AGENT_NAMES[agent]} limits`}>
      {windows.map((w) => {
        const level = usageLevel(w.usedPercent)
        const text = `${w.label} ${percentText(w, mode)} · resets in ${formatResetIn(w.resetsAt, now)}`
        return (
          <span key={w.label} className={`usage-strip-item usage-strip-${level}`} title={`${AGENT_NAMES[agent]} ${text}`}>
            <span className="usage-strip-label">{w.label}</span>
            <span className="usage-strip-bar" aria-hidden="true"><span style={{ width: `${Math.round(mode === 'used' ? w.usedPercent : 100 - w.usedPercent)}%` }} /></span>
            <span className="usage-strip-text">{percentText(w, mode)} · resets in {formatResetIn(w.resetsAt, now)}</span>
          </span>
        )
      })}
    </div>
  )
}
