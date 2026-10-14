import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { normalizeAsciiBackgrounds } from '../../shared/asciiBackground'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types'

const WRITE_DEBOUNCE_MS = 300

function normalizeMemorySettings(value: unknown): AppSettings['memory'] {
  const input = value && typeof value === 'object' ? value as Partial<AppSettings['memory']> : {}
  const defaults = DEFAULT_SETTINGS.memory
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim().slice(0, 200) : defaults.model
  const excluded = Array.isArray(input.excludedProjects)
    ? [...new Set(input.excludedProjects.filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length < 1024))]
    : []
  return { enabled: input.enabled === true, model, excludedProjects: excluded }
}
function normalizeRemoteSettings(value: unknown): AppSettings['remote'] {
  const input = value && typeof value === 'object' ? value as Partial<AppSettings['remote']> : {}
  const port = typeof input.port === 'number' && Number.isInteger(input.port) && input.port >= 1024 && input.port <= 65535
    ? input.port
    : DEFAULT_SETTINGS.remote.port
  return { enabled: input.enabled === true, port }
}
function normalizeVoiceSettings(value: unknown): AppSettings['voice'] {
  const input = value && typeof value === 'object' ? value as Partial<AppSettings['voice']> : {}
  const defaults = DEFAULT_SETTINGS.voice
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim().slice(0, 200) : defaults.model
  const holdMs = typeof input.holdMs === 'number' && Number.isFinite(input.holdMs) ? Math.min(1000, Math.max(250, Math.round(input.holdMs))) : defaults.holdMs
  const language = input.language === 'tr' || input.language === 'en' ? input.language : 'auto'
  const speak: Partial<AppSettings['voice']['speak']> = input.speak && typeof input.speak === 'object' ? input.speak : {}
  const speed = typeof speak.speed === 'number' && Number.isFinite(speak.speed) ? Math.min(2, Math.max(0.5, speak.speed)) : 1
  const studioDir = typeof speak.studioDir === 'string' ? speak.studioDir.trim().slice(0, 500) : ''
  return {
    enabled: input.enabled === true, model, holdMs, cleanup: input.cleanup !== false, language,
    speak: { enabled: speak.enabled === true, model: speak.model === 'ema' ? 'ema' : 'antalia', speed, studioDir }
  }
}
const BACKDROPS: AppSettings['backdrop'][] = ['none', 'mica', 'acrylic', 'tabbed']

/**
 * JSON-backed settings persistence (userData/settings.json). Reads are
 * immutable copies; writes are debounced 300ms and atomic (temp + rename).
 */
export class SettingsStore {
  private settings: AppSettings
  private writeTimer: NodeJS.Timeout | null = null

  constructor(private readonly filePath: string) {
    this.settings = this.normalize(this.load())
  }

  private load(): AppSettings {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as AppSettings
    } catch (err) {
      // Missing file (first run) or corrupt JSON: fall back to defaults.
      console.warn(`[settings] could not read ${this.filePath}:`, err)
      return { ...DEFAULT_SETTINGS }
    }
  }

  /** Schema evolution: fill missing/stale fields from DEFAULT_SETTINGS. */
  normalize(settings: AppSettings): AppSettings {
    const merged: AppSettings = { ...DEFAULT_SETTINGS, ...settings }
    // shortcuts is a nested object -> deep merge; profiles is replaced whole.
    merged.shortcuts = { ...DEFAULT_SETTINGS.shortcuts, ...(settings.shortcuts ?? {}) }
    merged.profiles = Array.isArray(settings.profiles) ? settings.profiles : []
    merged.providerProfiles = Array.isArray(settings.providerProfiles)
      ? settings.providerProfiles
      : structuredClone(DEFAULT_SETTINGS.providerProfiles)
    merged.sshConnections = Array.isArray(settings.sshConnections) ? settings.sshConnections : []
    // Eski "Blur" anahtarı: açıksa acrylic backdrop olarak devam eder.
    if ((settings as Partial<AppSettings>).backdrop === undefined && settings.blur) merged.backdrop = 'acrylic'
    if (!BACKDROPS.includes(merged.backdrop)) merged.backdrop = 'none'
    merged.asciiBackgrounds = normalizeAsciiBackgrounds(settings.asciiBackgrounds)
    merged.memory = normalizeMemorySettings(settings.memory)
    merged.remote = normalizeRemoteSettings(settings.remote)
    merged.voice = normalizeVoiceSettings(settings.voice)
    return merged
  }

  /** Immutable snapshot — callers must never mutate the returned object. */
  get(): AppSettings {
    return structuredClone(this.settings)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = this.normalize({ ...this.settings, ...patch })
    this.scheduleWrite()
    return this.get()
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), WRITE_DEBOUNCE_MS)
  }

  /** Synchronous write — call from before-quit so nothing is lost. */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.settings, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.warn('[settings] failed to persist settings:', err)
    }
  }
}
