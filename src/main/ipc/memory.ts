import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { MemoryAgent, MemoryConnection, MemoryInterval, MemoryProject, OpenRouterModelList, OpenRouterModelTest } from '../../shared/types'
import { connect, connectionStatus, disconnect, type ServerLaunch } from '../memory/connect'
import type { MemoryEngine } from '../memory/engine'
import { memoryDue } from '../memory/schedule'
import { testModel, type ModelCatalog } from '../memory/models'
import type { MemoryStore } from '../memory/store'

export const MEMORY_SECRET_ID = 'termflow-memory'
const AGENTS: MemoryAgent[] = ['claude', 'codex', 'opencode']
const FIRST_RUN_DELAY_MS = 30_000
/** Ayar degisince ya da uygulama gec acilinca zamani gelen calisma en gec bu kadar sonra baslar. */
const CHECK_MS = 5 * 60 * 1000

const isAgent = (value: unknown): value is MemoryAgent => AGENTS.includes(value as MemoryAgent)

export interface MemoryIpcDeps {
  engine: MemoryEngine
  store: MemoryStore
  /** null: sunucu betiği kurulamadı; bağlantı yapılamaz. */
  launch: ServerLaunch | null
  catalog: ModelCatalog
  getApiKey: () => string | undefined
}

export function registerMemoryIpc({ engine, store, launch, catalog, getApiKey }: MemoryIpcDeps): void {
  ipcMain.handle(IPC.MEMORY_STATUS, () => engine.getStatus())
  ipcMain.handle(IPC.MEMORY_RUN, () => engine.run({ force: true }))
  ipcMain.handle(IPC.MEMORY_PROJECTS, (): MemoryProject[] =>
    store.listProjects().map(({ key, path, lastSessionAt, generatedAt, sessions, status }) => ({ key, path, lastSessionAt, generatedAt, sessions, status })))
  ipcMain.handle(IPC.MEMORY_PROJECT, (_event, key: unknown) => typeof key === 'string' && key.length < 1024 ? store.readProject(key) : null)
  // Hariç tutma ayarını renderer kendi settings store'u üzerinden yazar; burada yalnızca veri silinir.
  ipcMain.handle(IPC.MEMORY_FORGET, (_event, key: unknown) => {
    if (typeof key === 'string' && key && key.length < 1024) engine.forget(key)
  })
  ipcMain.handle(IPC.MEMORY_CLEAR, () => engine.clear())
  ipcMain.handle(IPC.MEMORY_MODELS, (_event, force: unknown): Promise<OpenRouterModelList> => catalog.list(force === true))
  // Anahtar main'de kalır; renderer yalnız model id'sini gönderir.
  ipcMain.handle(IPC.MEMORY_TEST_MODEL, async (_event, model: unknown): Promise<OpenRouterModelTest> => {
    const id = typeof model === 'string' ? model.trim() : ''
    if (!id || id.length > 200) return { ok: false, model: id, latencyMs: 0, error: 'Enter an OpenRouter model id first.' }
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, model: id, latencyMs: 0, error: 'Save an OpenRouter API key first.' }
    return testModel(apiKey, id)
  })

  const unavailable = (agent: MemoryAgent): MemoryConnection => ({ agent, state: 'error', detail: 'Memory server is not installed. Restart TermFlow Lite.' })
  ipcMain.handle(IPC.MEMORY_CONNECTIONS, async (): Promise<MemoryConnection[]> =>
    Promise.all(AGENTS.map((agent) => launch ? connectionStatus(agent, launch) : unavailable(agent))))
  ipcMain.handle(IPC.MEMORY_CONNECT, async (_event, agent: unknown): Promise<MemoryConnection | null> => {
    if (!isAgent(agent)) return null
    return launch ? connect(agent, launch) : unavailable(agent)
  })
  ipcMain.handle(IPC.MEMORY_DISCONNECT, async (_event, agent: unknown): Promise<MemoryConnection | null> => {
    if (!isAgent(agent)) return null
    try {
      await disconnect(agent)
    } catch (error) {
      return { agent, state: 'error', detail: error instanceof Error ? error.message.split('\n')[0] : String(error) }
    }
    return launch ? connectionStatus(agent, launch) : { agent, state: 'disconnected' }
  })
}

/** Kullanicinin sectigi sikliga gore (saatlik/gunluk/haftalik); yeni session yoksa API cagrisi olmaz. */
export function startMemoryScheduler(engine: MemoryEngine, getEvery: () => MemoryInterval): () => void {
  const tick = (): void => {
    if (!memoryDue(engine.getStatus().lastRunAt, getEvery(), Date.now())) return
    void engine.run().catch((error) => console.warn('[memory] run failed:', error))
  }
  const first = setTimeout(tick, FIRST_RUN_DELAY_MS)
  const interval = setInterval(tick, CHECK_MS)
  return () => {
    clearTimeout(first)
    clearInterval(interval)
  }
}

export function sendMemoryStatus(window: BrowserWindow | null, status: unknown): void {
  if (window && !window.isDestroyed()) window.webContents.send(IPC.MEMORY_STATUS_EVENT, status)
}
