import { useCallback, useEffect, useState } from 'react'
import { Bot, FolderGit2, QrCode, Settings as SettingsIcon, SquareTerminal, WifiOff } from 'lucide-react'
import { isLightColor } from '../../renderer/src/backdrop'
import { resolveTheme } from '../../renderer/src/themes/themes'
import { RemoteClient, loadToken, pairWithCode, saveToken } from './client'
import { useRemote, type Screen } from './store'
import { Toasts } from './ui'
import { TerminalScreen } from './views/TerminalScreen'
import { AgentsScreen } from './views/AgentsScreen'
import { ProjectScreen } from './views/ProjectScreen'
import { SettingsScreen } from './views/SettingsScreen'

const NAV: { id: Screen; label: string; icon: React.JSX.Element }[] = [
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={20} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={20} /> },
  { id: 'project', label: 'Project', icon: <FolderGit2 size={20} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={20} /> }
]

/** Reads a one-time code from #pair=..., removing it from the address bar right away. */
function takePairCode(): string | null {
  const match = /(?:^#|&)pair=([A-Za-z0-9_-]{6,100})/.exec(location.hash)
  if (!match) return null
  history.replaceState(null, '', location.pathname)
  return match[1]
}

/** Started from the home screen: iOS gives it storage separate from Safari. */
const standalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

function PairScreen({ error, busy, onCode }: { error: string | null; busy: boolean; onCode(code: string): void }): React.JSX.Element {
  const [code, setCode] = useState('')
  return (
    <main className="pair">
      <img src="/icon-192.png" alt="" className="pair-logo" />
      <h1>TermFlow Remote</h1>
      {busy
        ? <p>Pairing with your computer...</p>
        : (
          <>
            <p>Control TermFlow Lite on your computer from this phone.</p>
            <ol>
              <li>On the computer open <strong>Settings &gt; Remote Access</strong> and turn it on.</li>
              <li>Press <strong>Show QR code</strong>.</li>
              <li>Scan the code with this phone's camera.</li>
            </ol>
            <div className="pair-hint"><QrCode size={16} /> Both devices must be on the same Tailscale network.</div>
            <form className="pair-code" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onCode(code) }}>
              <label htmlFor="pair-code">{standalone() ? 'From the home screen the camera cannot hand the QR to this app. Type the code shown under the QR instead:' : 'Or type the code shown under the QR:'}</label>
              <div className="pair-code-row">
                <input
                  id="pair-code"
                  className="input mono"
                  placeholder="XXXXX-XXXXX"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  inputMode="text"
                  maxLength={20}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn primary" type="submit" disabled={!code.trim()}>Pair</button>
              </div>
            </form>
          </>
        )}
      {error && <p className="pair-error">{error}</p>}
    </main>
  )
}

function useViewportHeight(): void {
  // Keeps the layout above the on-screen keyboard on browsers that overlay it.
  useEffect(() => {
    const vv = window.visualViewport
    const apply = (): void => {
      document.documentElement.style.setProperty('--app-height', `${Math.round(vv?.height ?? window.innerHeight)}px`)
    }
    apply()
    vv?.addEventListener('resize', apply)
    window.addEventListener('resize', apply)
    return () => {
      vv?.removeEventListener('resize', apply)
      window.removeEventListener('resize', apply)
    }
  }, [])
}

/** The phone chrome takes the light/dark tone of the desktop terminal theme. */
function useDesktopTone(): void {
  const settings = useRemote((s) => s.settings)
  useEffect(() => {
    if (!settings) return
    const light = isLightColor(resolveTheme(settings).colors.background)
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f5f8' : '#0e1014')
  }, [settings])
}

export function App(): React.JSX.Element {
  const [token, setToken] = useState<string | null>(() => loadToken())
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairing, setPairing] = useState(false)
  const connection = useRemote((s) => s.connection)
  const device = useRemote((s) => s.device)
  const screen = useRemote((s) => s.screen)
  const setScreen = useRemote((s) => s.setScreen)
  const attach = useRemote((s) => s.attach)
  useViewportHeight()
  useDesktopTone()

  const pairCode = useCallback((code: string): void => {
    setPairing(true)
    pairWithCode(code)
      .then((next) => {
        saveToken(next)
        setToken(next)
        setPairError(null)
      })
      .catch((error: Error) => setPairError(error.message))
      .finally(() => setPairing(false))
  }, [])

  // A QR scanned while this page is already open only changes the hash.
  useEffect(() => {
    const tryPair = (): void => {
      const code = takePairCode()
      if (!code) return
      pairCode(code)
    }
    tryPair()
    window.addEventListener('hashchange', tryPair)
    return () => window.removeEventListener('hashchange', tryPair)
  }, [pairCode])

  useEffect(() => {
    if (!token) return
    const remote = new RemoteClient(token)
    const detach = attach(remote)
    remote.start()
    return () => {
      detach()
      remote.stop()
    }
  }, [token, attach])

  useEffect(() => {
    if (connection !== 'revoked') return
    setToken(null)
    setPairError('This phone was disconnected from the computer. Scan a new QR code to pair again.')
  }, [connection])

  if (!token || connection === 'revoked') return <PairScreen error={pairError} busy={pairing} onCode={pairCode} />

  if (!device) {
    return (
      <main className="pair">
        <img src="/icon-192.png" alt="" className="pair-logo" />
        <h1>TermFlow Remote</h1>
        <p>{connection === 'offline' ? 'Your computer is not reachable. Is TermFlow Lite running and Tailscale connected?' : 'Connecting to your computer...'}</p>
        {connection === 'offline' && <div className="pair-hint"><WifiOff size={16} /> Retrying automatically</div>}
      </main>
    )
  }

  return (
    <div className="app">
      <header className="app-head">
        <span className={`conn ${connection}`} title={connection} />
        <span className="app-title">TermFlow</span>
        {connection !== 'online' && <span className="app-sub">{connection === 'connecting' ? 'Connecting...' : 'Offline'}</span>}
      </header>
      <main className="app-main">
        {/* The terminal stays mounted so switching screens keeps its state. */}
        <div className="screen" hidden={screen !== 'terminal'}><TerminalScreen /></div>
        {screen === 'agents' && <div className="screen scroll"><AgentsScreen /></div>}
        {screen === 'project' && <div className="screen scroll"><ProjectScreen /></div>}
        {screen === 'settings' && <div className="screen scroll"><SettingsScreen /></div>}
      </main>
      <nav className="bottom-nav" aria-label="Sections">
        {NAV.map((item) => (
          <button key={item.id} className={screen === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setScreen(item.id)} aria-current={screen === item.id ? 'page' : undefined}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  )
}
