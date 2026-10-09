import { useState } from 'react'
import { ArrowLeft, Bot, Brain, ChevronRight, Info, Palette, Server, ShieldCheck, Smartphone, SquareTerminal, TerminalSquare, UserRound } from 'lucide-react'
import { RETRO_THEMES, THEMES } from '../../../renderer/src/themes/themes'
import { client, errorText, useRemote } from '../store'
import { Confirm, Group, Row, Select } from '../ui'
import { APPEARANCE_FIELDS, SECURITY_FIELDS, SettingRows, TERMINAL_GROUPS } from './settings/fields'
import { ProfilesPage, ProvidersPage, SshPage } from './settings/editors'
import { MemoryPage, ShellsPage, UpdatesRow } from './settings/pages'

type Page = 'appearance' | 'terminal' | 'shells' | 'profiles' | 'providers' | 'ssh' | 'security' | 'memory' | 'device' | 'about'

const PAGES: { id: Page; label: string; hint: string; icon: React.JSX.Element }[] = [
  { id: 'appearance', label: 'Appearance', hint: 'Theme, font, cursor, effects', icon: <Palette size={18} /> },
  { id: 'terminal', label: 'Terminal', hint: 'Startup folder, scrollback, behaviour', icon: <SquareTerminal size={18} /> },
  { id: 'shells', label: 'Shells', hint: 'Default profile, health checks', icon: <TerminalSquare size={18} /> },
  { id: 'profiles', label: 'Profiles', hint: 'Agents and custom commands', icon: <UserRound size={18} /> },
  { id: 'providers', label: 'Providers', hint: 'API providers and keys', icon: <Bot size={18} /> },
  { id: 'ssh', label: 'SSH', hint: 'Saved connections', icon: <Server size={18} /> },
  { id: 'security', label: 'Agent security', hint: 'Default permissions', icon: <ShieldCheck size={18} /> },
  { id: 'memory', label: 'Memory', hint: 'Agent memory and OpenRouter', icon: <Brain size={18} /> },
  { id: 'device', label: 'This phone', hint: 'Connection and pairing', icon: <Smartphone size={18} /> },
  { id: 'about', label: 'About', hint: 'Version, updates, product owner', icon: <Info size={18} /> }
]

function AppearancePage(): React.JSX.Element | null {
  const settings = useRemote((s) => s.settings)
  const update = useRemote((s) => s.updateSettings)
  if (!settings) return null
  const themes = [...THEMES, ...(settings.retroUnlocked ? RETRO_THEMES : [])].filter((t) => t.id !== 'custom' || settings.customTheme)
  return (
    <>
      <Group title="Theme">
        <Row label="Color theme">
          <Select label="Color theme" value={settings.themeId} options={themes.map((t) => ({ value: t.id, label: t.name }))} onChange={(themeId) => void update({ themeId })} />
        </Row>
      </Group>
      <Group title="Text and window"><SettingRows fields={APPEARANCE_FIELDS} /></Group>
      <p className="page-note">Custom colors, ASCII backgrounds and keyboard shortcuts are edited on the computer.</p>
    </>
  )
}

function DevicePage(): React.JSX.Element {
  const device = useRemote((s) => s.device)
  const connection = useRemote((s) => s.connection)
  const toast = useRemote((s) => s.toast)
  const [confirm, setConfirm] = useState(false)
  const forget = async (): Promise<void> => {
    setConfirm(false)
    try {
      await client().call('device.forget')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }
  return (
    <>
      <Group>
        <Row label="Name" hint="As listed on the computer">{device?.name}</Row>
        <Row label="Connection" hint={location.host}>{connection === 'online' ? 'Connected' : connection}</Row>
      </Group>
      <p className="page-note">
        This phone stays paired until it is disconnected here or in Settings &gt; Remote Access on the computer.
        Add this page to your home screen for a full-screen app.
      </p>
      <button className="btn wide danger" onClick={() => setConfirm(true)}>Disconnect this phone</button>
      {confirm && (
        <Confirm title="Disconnect this phone?" text="You will need to scan a new QR code on the computer to connect again." confirmLabel="Disconnect" danger onCancel={() => setConfirm(false)} onConfirm={() => void forget()} />
      )}
    </>
  )
}

function AboutPage(): React.JSX.Element {
  const version = useRemote((s) => s.version)
  return (
    <>
      <Group>
        <Row label="TermFlow Lite" hint="Running on your computer">{version}</Row>
        <UpdatesRow />
      </Group>
      <Group title="Product Owner">
        <Row label="Umut Çelik (palamut62)" />
        <a className="row clickable" href="https://x.com/palamut62" target="_blank" rel="noopener noreferrer"><span className="row-label">X (Twitter)</span><ChevronRight size={16} /></a>
        <a className="row clickable" href="https://github.com/palamut62" target="_blank" rel="noopener noreferrer"><span className="row-label">GitHub</span><ChevronRight size={16} /></a>
      </Group>
    </>
  )
}

export function SettingsScreen(): React.JSX.Element {
  const [page, setPage] = useState<Page | null>(null)
  const current = PAGES.find((p) => p.id === page)

  if (!current) {
    return (
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <p className="page-note">Changes apply to TermFlow Lite on your computer right away.</p>
        <Group>
          {PAGES.map((p) => (
            <Row key={p.id} label={<><span className="row-icon">{p.icon}</span>{p.label}</>} hint={p.hint} onClick={() => setPage(p.id)}>
              <ChevronRight size={16} />
            </Row>
          ))}
        </Group>
      </div>
    )
  }

  return (
    <div className="page">
      <button className="back" onClick={() => setPage(null)}><ArrowLeft size={18} /> Settings</button>
      <h1 className="page-title">{current.label}</h1>
      {page === 'appearance' && <AppearancePage />}
      {page === 'terminal' && TERMINAL_GROUPS.map((g) => <Group key={g.title} title={g.title}><SettingRows fields={g.fields} /></Group>)}
      {page === 'shells' && <ShellsPage />}
      {page === 'profiles' && <ProfilesPage />}
      {page === 'providers' && <ProvidersPage />}
      {page === 'ssh' && <SshPage />}
      {page === 'security' && <Group><SettingRows fields={SECURITY_FIELDS} /></Group>}
      {page === 'memory' && <MemoryPage />}
      {page === 'device' && <DevicePage />}
      {page === 'about' && <AboutPage />}
    </div>
  )
}
