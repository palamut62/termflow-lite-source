import { BarChart3 } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { useStatsStore } from '../store/statsStore'

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} days`
}

/** Stats & Usage (Orca Ayarlar > Interface): yerel sayaclar; ayrintili kart Wrapped'ta. */
export function StatsSettings(): React.JSX.Element {
  const stats = useStatsStore((s) => s.stats)
  const cards = [
    { label: 'Agent sessions started', value: stats.agentSessions.toLocaleString() },
    { label: 'Commands run', value: stats.commands.toLocaleString() },
    { label: 'Measured command time', value: formatDuration(stats.timedMs) },
    { label: 'Failed commands', value: stats.failures.toLocaleString() }
  ]
  return (
    <div className="settings-section">
      <h2><BarChart3 size={18} /> Stats &amp; Usage</h2>
      <p className="settings-section-description">
        Counted on this computer since {new Date(stats.since).toLocaleDateString()}. Nothing leaves your machine.
        Provider limits are in the status bar.
      </p>
      <div className="stats-cards">
        {cards.map((card) => (
          <div key={card.label} className="stats-card"><strong>{card.value}</strong><span>{card.label}</span></div>
        ))}
      </div>
      <button className="settings-btn" onClick={() => { useSettingsStore.getState().closeSettings(); useStatsStore.getState().show() }}>Open TermFlow Wrapped</button>
    </div>
  )
}
