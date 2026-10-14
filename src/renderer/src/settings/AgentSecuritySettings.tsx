import { ShieldCheck } from 'lucide-react'
import type { AgentPermissionMode } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { Field, Select, Toggle } from './Settings'

const OPTIONS = [
  { value: 'safe', label: 'Safe - read-only / plan mode' },
  { value: 'workspace', label: 'Workspace - project writes with approvals' },
  { value: 'full', label: 'Full Access - no sandbox or approvals' }
]

export function AgentSecuritySettings(): React.JSX.Element {
  const mode = useSettingsStore((state) => state.settings.defaultAgentPermissionMode)
  const update = useSettingsStore((state) => state.update)
  const agentHooks = useSettingsStore((state) => state.settings.agentHooks)
  const usageDisplay = useSettingsStore((state) => state.settings.usageDisplay)
  const claudeUsage = useSettingsStore((state) => state.settings.claudeUsage)
  const usageCard = useSettingsStore((state) => state.settings.usageCard)
  return <div className="settings-section">
    <h2><ShieldCheck size={18} /> Agent Security</h2>
    <p className="settings-section-description">The selected policy is pinned when a new agent tab starts. Existing sessions are never silently elevated by a settings change.</p>
    <Field label="Default permission mode" hint="Workspace is recommended for normal development">
      <Select value={mode} options={OPTIONS} onChange={(value) => { void update({ defaultAgentPermissionMode: value as AgentPermissionMode }) }} />
    </Field>
    <Field label="Agent status from the agent" hint="New Claude Code and Codex tabs report working, needs approval and done themselves. Passed as launch arguments only; your Claude and Codex config files are never changed">
      <Toggle checked={agentHooks} onChange={(value) => { void update({ agentHooks: value }) }} label="Agent status hooks" />
    </Field>
    <Field label="Usage limits in the status bar" hint="5-hour and weekly limits of the active Claude Code or Codex tab, shown like Codex does. Other agents (Gemini, OpenCode, ...) publish no limit data, so nothing is shown for them. Amber at 80%, red at 95%">
      <Select value={usageDisplay} options={[{ value: 'used', label: 'Show % used' }, { value: 'remaining', label: 'Show % remaining' }, { value: 'off', label: 'Off' }]} onChange={(value) => { void update({ usageDisplay: value as 'off' | 'used' | 'remaining' }) }} />
    </Field>
    <Field label="Limit cards" hint="Show the active agent's limits as small cards in the top-right corner of the terminal; green, amber at 80%, red at 95%">
      <Toggle checked={usageCard} disabled={usageDisplay === 'off'} onChange={(value) => { void update({ usageCard: value }) }} label="Limit cards" />
    </Field>
    <Field label="Claude limits" hint="Claude Pro/Max only. New Claude Code tabs get a small status line helper that hands the limits to TermFlow. Your own status line keeps showing as before; without one, Claude hides footer hints such as 'esc to interrupt'. Needs Git Bash on Windows">
      <Toggle checked={claudeUsage} disabled={!agentHooks} onChange={(value) => { void update({ claudeUsage: value }) }} label="Claude limits" />
    </Field>
    <div className="agent-security-grid">
      <article><strong>Safe</strong><span>Codex read-only sandbox. Claude plan mode. No file modifications.</span></article>
      <article><strong>Workspace</strong><span>Codex is confined to the active project. Claude keeps native manual approvals enabled.</span></article>
      <article><strong>Full Access</strong><span>Disables the agent sandbox and approval prompts. Use only in trusted projects.</span></article>
      <article><strong>OpenCode</strong><span>Safe and Workspace fail closed until a verified OpenCode permission contract is available.</span></article>
    </div>
  </div>
}
