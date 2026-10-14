import { Bell } from 'lucide-react'
import type { AgentAlertSettings, AlertChannel } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { forgetAlertFile } from '../fun/sounds'
import { testAlertSound } from '../attention/alerts'
import { Field, NumberInput, Toggle } from './Settings'

const CATEGORIES: { key: 'needsInput' | 'done' | 'error'; label: string; hint: string }[] = [
  { key: 'needsInput', label: 'Agent needs you', hint: 'An approval or a question is waiting' },
  { key: 'done', label: 'Agent finished', hint: 'A turn ended and you have not seen it' },
  { key: 'error', label: 'Agent failed', hint: 'A turn stopped with an API error' }
]

/** Ayarlar > Notifications (agent-attention). Komut bildirimleri Terminal bolumunde kalir. */
export function NotificationSettings(): React.JSX.Element {
  const alerts = useSettingsStore((s) => s.settings.agentAlerts)
  const agentHooks = useSettingsStore((s) => s.settings.agentHooks)
  const update = useSettingsStore((s) => s.update)
  const toast = useToastStore((s) => s.show)
  const save = (patch: Partial<AgentAlertSettings>): void => { void update({ agentAlerts: { ...alerts, ...patch } }) }
  const saveChannel = (key: 'needsInput' | 'done' | 'error', patch: Partial<AlertChannel>): void => save({ [key]: { ...alerts[key], ...patch } })

  const pickSound = async (): Promise<void> => {
    const result = await window.termflow.alerts.pickSound()
    if (!result) return
    if ('error' in result) { toast(result.error, 'error'); return }
    forgetAlertFile()
    save({ soundFile: result.file })
    toast('Alert sound saved', 'success')
  }

  return (
    <div className="settings-section">
      <h2><Bell size={18} /> Notifications</h2>
      <p className="settings-section-description">
        When a Claude Code or Codex tab you are not looking at needs you, finishes or fails, the tab and the bell get a dot,
        the taskbar shows a badge, and you can get a system notification and a sound.
        {!agentHooks && ' Turn on "Agent status from the agent" in Agent Security for this to work.'}
        {' '}Notifications for long shell commands are under Terminal.
      </p>
      {CATEGORIES.map((category) => (
        <Field key={category.key} label={category.label} hint={category.hint}>
          <div className="settings-inline">
            <Toggle checked={alerts[category.key].system} onChange={(v) => saveChannel(category.key, { system: v })} label={`${category.label}: system notification`} />
            <span className="settings-inline-label">Notify</span>
            <Toggle checked={alerts[category.key].sound} onChange={(v) => saveChannel(category.key, { sound: v })} label={`${category.label}: sound`} />
            <span className="settings-inline-label">Sound</span>
          </div>
        </Field>
      ))}
      <Field label="Sound" hint={alerts.soundFile ? `Custom file (${alerts.soundFile})` : 'Built-in chime. MP3, WAV, OGG, M4A, AAC or FLAC up to 5 MB'}>
        <div className="settings-inline">
          <button className="settings-btn settings-btn-small" onClick={() => void pickSound()}>Choose file...</button>
          {alerts.soundFile && <button className="settings-btn settings-btn-small" onClick={() => { forgetAlertFile(); save({ soundFile: '' }) }}>Use built-in</button>}
          <button className="settings-btn settings-btn-small" onClick={testAlertSound}>Test</button>
        </div>
      </Field>
      <Field label="Volume" hint="0 to 100">
        <NumberInput value={alerts.volume} min={0} max={100} step={5} onChange={(v) => save({ volume: v })} />
      </Field>
    </div>
  )
}
