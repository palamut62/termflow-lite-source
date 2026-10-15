import { useEffect } from 'react'
import { ArrowLeft, FolderOpen, Image as ImageIcon } from 'lucide-react'
import { RemoteSettings } from '../../../settings/RemoteSettings'
import { formatBytes, useMediaStore } from '../../../store/mediaStore'
import { useTerminalStore } from '../../../store/terminalStore'
import { relativeTime } from '../../../components/AgentSessions'
import { useIdePageStore, type IdePage as Page } from './idePageStore'
import { TasksPage } from './TasksPage'
import { AutomationsPage } from './AutomationsPage'
import { ReviewPage } from '../review/ReviewPage'
import { NotesPage } from '../review/NotesPage'

const TITLES: Record<Page, string> = { tasks: 'Tasks', automations: 'Automations', mobile: 'Mobile', artifacts: 'Artifacts', review: 'Review changes', notes: 'Notes' }

/** Artifacts (PRD F4.4): bu oturumda ajanlarin urettigi / paylasilan medya (mediaStore). */
function ArtifactsPage(): React.JSX.Element {
  const items = useMediaStore((s) => s.items)
  const tabs = useTerminalStore((s) => s.tabs)
  if (items.length === 0) {
    return (
      <div className="ide-page-body ide-page-empty">
        <ImageIcon size={28} />
        <strong>No shared artifacts</strong>
        <span>Screenshots, images and videos that agents create or you paste into a terminal show up here.</span>
      </div>
    )
  }
  return (
    <div className="ide-page-body">
      <div className="ide-artifacts">
        {[...items].sort((a, b) => b.addedAt - a.addedAt).map((item) => (
          <figure key={item.id} className="ide-artifact">
            <button className="ide-artifact-thumb" onClick={() => useMediaStore.getState().view(item.id)} title={`Open ${item.name}`}>
              {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <ImageIcon size={24} />}
            </button>
            <figcaption>
              <strong title={item.path}>{item.name}</strong>
              <span>{tabs.find((t) => t.id === item.tabId)?.title ?? 'Closed tab'} - {formatBytes(item.size)} - {relativeTime(item.addedAt)}</span>
            </figcaption>
            <button className="ide-icon-btn" onClick={() => void window.termflow.system.revealInFolder(item.path)} title="Reveal in folder" aria-label={`Reveal ${item.name}`}><FolderOpen size={13} /></button>
          </figure>
        ))}
      </div>
    </div>
  )
}

/**
 * Agent IDE orta sutun sayfasi (Orca: Tasks, Automations, Mobile, Artifacts tam sayfa). TerminalArea altta
 * kalir ve yeniden kurulmaz; "Back to terminals" ya da Escape sayfayi kapatir.
 */
export function IdePageView(): React.JSX.Element | null {
  const page = useIdePageStore((s) => s.page)
  const close = useIdePageStore((s) => s.close)
  const context = useIdePageStore((s) => s.context)
  const activeCwd = useTerminalStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.worktree?.path || tab?.cwd || tab?.launchCwd || ''
  })
  const cwd = context.cwd || activeCwd
  useEffect(() => {
    if (!page) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, close])
  if (!page) return null
  return (
    <section className="ide-page" aria-label={TITLES[page]}>
      <header className="ide-page-head">
        <button className="settings-btn" onClick={close}><ArrowLeft size={14} /> Back to terminals</button>
        <h1>{TITLES[page]}</h1>
      </header>
      {page === 'tasks' && <TasksPage />}
      {page === 'automations' && <AutomationsPage />}
      {page === 'mobile' && <div className="ide-page-body ide-page-narrow"><RemoteSettings /></div>}
      {page === 'artifacts' && <ArtifactsPage />}
      {(page === 'review' || page === 'notes') && !cwd && <div className="ide-page-body ide-page-empty"><strong>No workspace</strong><span>Open a terminal in a project folder first.</span></div>}
      {page === 'review' && cwd && <ReviewPage key={cwd} cwd={cwd} initialFile={context.file} />}
      {page === 'notes' && cwd && <NotesPage cwd={cwd} />}
    </section>
  )
}
