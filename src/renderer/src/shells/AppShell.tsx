import { useSettingsStore } from '../store/settingsStore'
import { TabBar } from '../tabs/TabBar'
import { SessionRail } from '../components/SessionRail'
import { FilePanel } from '../components/FilePanel'
import { StatusBar } from '../components/StatusBar'
import { TerminalArea } from './TerminalArea'
import { IdeSidebar } from './ide/IdeSidebar'
import { RightPanel } from './ide/RightPanel'

/**
 * Uygulama yerlesimi. Terminal modu TermFlow Lite'in kendisidir. Agent IDE modu (yalniz IDE surumu,
 * docs/agent-ide/PRD.md) ayni bilesenleri farkli cerceveyle kullanir.
 * TerminalArea iki modda da `.app-body` icinde AYNI sirada durur: mod degisince React terminalleri
 * yeniden kurmaz, xterm/WebGL ve PTY akisi kesilmez.
 */
export function AppShell(): React.JSX.Element {
  const tabHeight = useSettingsStore((s) => s.settings.tabHeight)
  const showSessionRail = useSettingsStore((s) => s.settings.showSessionRail)
  const ide = useSettingsStore((s) => s.settings.uiMode === 'ide')
  const rightOpen = useSettingsStore((s) => s.settings.ide.rightOpen)
  return (
    <>
      <TabBar height={tabHeight} />
      <div className={ide ? 'app-body ide-body' : 'app-body'}>
        {ide ? <IdeSidebar /> : showSessionRail && <SessionRail />}
        <TerminalArea />
        {ide ? rightOpen && <RightPanel /> : <FilePanel />}
      </div>
      <StatusBar />
    </>
  )
}
