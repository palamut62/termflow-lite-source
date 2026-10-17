// Orchestration'in ana surec tarafi tek yerde: hedefler, model listeleri, limit raporu, Test ve API.

import { execFile, execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { liveWindows, type AgentUsage } from '../../shared/usage'
import type { AppSettings, DelegateAgentKind, DelegatedTask, OpenRouterModel, OpenRouterModelList, OrchestrationTarget, OrchestrationTestResult } from '../../shared/types'
import { discardTask, runDelegatedTask, taskDiff } from '../agentRunner'
import type { ModelCatalog } from '../memory/models'
import { cliInvocation } from '../terminal/cli'
import type { OrchestrationApi } from './apiServer'
import { listTargets, resolveTarget, TaskManager, type TargetContext } from './manager'
import { agentModelCatalog, FALLBACK_MODELS, type RunCli } from './models'

const exec = promisify(execFile)
const INSTALLED_TTL_MS = 60_000
const TEST_TIMEOUT_MS = 4 * 60_000
const TEST_FILE = 'termflow-check.txt'
const TEST_PROMPT = `Create a file named ${TEST_FILE} in the current directory whose entire content is the word ok. Do not create or change any other file.`

export interface ServiceDeps {
  dir: string
  getSettings: () => AppSettings
  detectInstalled: () => Promise<string[]>
  getSecret: (providerId: string) => string | undefined
  readUsage: () => Promise<AgentUsage[]>
  onTasks?: (tasks: DelegatedTask[]) => void
  runCli?: RunCli
}

const defaultRunCli: RunCli = async (command, args) => {
  const resolved = cliInvocation(command, args)
  const { stdout } = await exec(resolved.file, resolved.args, { timeout: 60_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

/**
 * Gercekten ucretsiz: OpenCode'un kendi sundugu (`opencode/`) ya da adi `-free` ile biten model. Abonelik planlari
 * (`minimax-coding-plan/...`) ve kullanicinin kendi anahtariyla calisan saglayicilar listede 0 fiyatli gorunse de sayilmaz.
 */
export const isFreeModel = (id: string, models: readonly OpenRouterModel[]): boolean => {
  if (!id.startsWith('opencode/') && !/-free$/i.test(id)) return false
  const known = models.find((item) => item.id === id)
  return known ? known.inputPrice === 0 && known.outputPrice === 0 : /-free$/i.test(id)
}

function costLabel(target: OrchestrationTarget, free: boolean): string {
  if (free) return 'FREE'
  if (target.providerId) return 'paid: billed to the provider API key'
  if (target.agent === 'opencode') return 'paid model'
  return 'uses that CLI\'s own subscription'
}

/** list_agents'in koordinatore donen metni. */
export function agentsReport(targets: (OrchestrationTarget & { free: boolean })[], usage: AgentUsage[], threshold: number, freeModels: string[], now = Date.now()): string {
  const ready = targets.filter((t) => t.installed && t.enabled && t.hasCredential !== false)
  const lines = ['Agents you can delegate to (pass the id as "agent"):']
  for (const t of ready) lines.push(`- ${t.id} · ${t.label} · ${t.model || 'CLI default model'} · ${costLabel(t, t.free)}`)
  if (!ready.length) lines.push('- none (turn agents on in TermFlow Settings > Orchestration)')
  const unavailable = targets.filter((t) => !ready.includes(t))
  if (unavailable.length) {
    lines.push(`Not available: ${unavailable.map((t) => `${t.id} (${!t.installed ? 'not installed' : !t.enabled ? 'turned off' : 'no API key'})`).join(', ')}`)
  }
  if (freeModels.length) lines.push(`Other free OpenCode models (pass as "model" with agent "opencode"): ${freeModels.slice(0, 12).join(', ')}`)

  const usageParts = usage.map((u) => {
    const windows = liveWindows(u.windows, now)
    return windows.length ? `${u.agent === 'claude' ? 'Claude' : 'Codex'} ${windows.map((w) => `${w.label} ${Math.round(w.usedPercent)}%`).join(', ')}` : ''
  }).filter(Boolean)
  lines.push(`Usage limits: ${usageParts.length ? usageParts.join(' · ') : 'unknown (no recent data)'}`)
  const claude5h = liveWindows(usage.find((u) => u.agent === 'claude')?.windows ?? [], now).find((w) => w.label === '5h')
  const freeIds = ready.filter((t) => t.free).map((t) => t.id)
  if (threshold > 0 && claude5h && claude5h.usedPercent >= threshold) {
    lines.push(`Hint: Claude 5-hour usage is ${Math.round(claude5h.usedPercent)}% (threshold ${threshold}%). Delegate mechanical work${freeIds.length ? ` to a free agent: ${freeIds.join(', ')}` : ''}; keep planning and review yourself.`)
  } else {
    lines.push('Hint: delegate only well-specified, mechanical work; review every result before applying it.')
  }
  return lines.join('\n')
}

export class OrchestrationService {
  readonly manager: TaskManager
  private installedCache: { at: number; ids: string[] } | null = null
  private readonly catalogs = new Map<DelegateAgentKind, ModelCatalog | null>()
  private readonly runCli: RunCli

  constructor(private readonly deps: ServiceDeps) {
    this.runCli = deps.runCli ?? defaultRunCli
    this.manager = new TaskManager({
      file: join(deps.dir, 'tasks.json'),
      getSettings: deps.getSettings,
      resolve: async (target, model) => resolveTarget(await this.context(), target, model, deps.getSecret),
      onChange: deps.onTasks
    })
  }

  private async installed(): Promise<string[]> {
    if (this.installedCache && Date.now() - this.installedCache.at < INSTALLED_TTL_MS) return this.installedCache.ids
    const ids = await this.deps.detectInstalled().catch(() => [] as string[])
    this.installedCache = { at: Date.now(), ids }
    return ids
  }

  private async context(): Promise<TargetContext> {
    return { settings: this.deps.getSettings(), installed: await this.installed(), hasSecret: (id) => Boolean(this.deps.getSecret(id)) }
  }

  async targets(): Promise<OrchestrationTarget[]> {
    this.installedCache = null
    return listTargets(await this.context())
  }

  private catalog(agent: DelegateAgentKind): ModelCatalog | null {
    if (!this.catalogs.has(agent)) this.catalogs.set(agent, agentModelCatalog(this.deps.dir, agent, this.runCli))
    return this.catalogs.get(agent) ?? null
  }

  /** Hedefin model listesi: CLI'dan (cache'li), saglayici profilinde profilin kendi modelleri. */
  async models(targetId: string, force = false): Promise<OpenRouterModelList> {
    const target = listTargets(await this.context()).find((item) => item.id === targetId)
    if (!target) return { models: [], fetchedAt: 0, source: 'none', error: `Unknown target ${targetId}` }
    if (target.providerId) {
      const provider = this.deps.getSettings().providerProfiles.find((item) => item.id === target.providerId)
      const ids = [...new Set([provider?.model, ...(provider?.models ?? [])].filter((id): id is string => Boolean(id)))]
      return { models: ids.map((id) => ({ id, name: id, contextLength: 0, inputPrice: null, outputPrice: null, structured: true, audio: false })), fetchedAt: 0, source: 'none' }
    }
    const catalog = this.catalog(target.agent)
    if (!catalog) return { models: FALLBACK_MODELS[target.agent], fetchedAt: 0, source: 'none' }
    return catalog.list(force)
  }

  async report(): Promise<{ report: string; targets: (OrchestrationTarget & { free: boolean })[] }> {
    const ctx = await this.context()
    const opencodeModels = ctx.installed.includes('opencode') ? (await this.catalog('opencode')?.list().catch(() => null))?.models ?? [] : []
    const targets = listTargets(ctx).map((t) => ({ ...t, free: t.agent === 'opencode' && Boolean(t.model) && isFreeModel(t.model, opencodeModels) }))
    const freeModels = opencodeModels.filter((m) => m.structured && isFreeModel(m.id, opencodeModels)).map((m) => m.id)
    const usage = await this.deps.readUsage().catch(() => [] as AgentUsage[])
    return { report: agentsReport(targets, usage, ctx.settings.orchestration.claudeThreshold, freeModels), targets }
  }

  /** Secili hedef + modeli uygulamanin gercekte kullandigi yoldan dener: gecici depo, worktree, dosya kontrolu. */
  async test(targetId: string, model?: string): Promise<OrchestrationTestResult> {
    const started = Date.now()
    const resolved = resolveTarget(await this.context(), targetId, model, this.deps.getSecret)
    if ('error' in resolved) return { ok: false, status: 'failed', latencyMs: 0, error: resolved.error }
    if (resolved.agent === 'opencode' && this.manager.list().some((t) => t.status === 'running' && t.target === 'opencode')) {
      return { ok: false, status: 'failed', latencyMs: 0, error: 'An OpenCode task is running; test again after it finishes.' }
    }
    const sandbox = mkdtempSync(join(tmpdir(), 'termflow-orch-test-'))
    const repo = join(sandbox, 'repo')
    try {
      const git = (args: string[]): void => { execFileSync('git', args, { cwd: repo, windowsHide: true, stdio: 'ignore' }) }
      execFileSync('git', ['init', '-q', repo], { windowsHide: true, stdio: 'ignore' })
      writeFileSync(join(repo, 'README.md'), 'TermFlow orchestration test\n')
      git(['add', '.'])
      git(['-c', 'user.name=TermFlow', '-c', 'user.email=test@termflow.local', 'commit', '-qm', 'init'])
      const result = await runDelegatedTask({
        id: `test${Date.now().toString(36)}`, repoRoot: repo, agent: resolved.agent, model: resolved.model, prompt: TEST_PROMPT,
        timeoutMs: TEST_TIMEOUT_MS, env: resolved.env
      }).done
      let content = ''
      try { content = readFileSync(join(result.worktreePath ?? '', TEST_FILE), 'utf8').trim() } catch { /* yazilmadi */ }
      if (result.worktreePath) await discardTask(repo, result).catch(() => undefined)
      const ok = result.status === 'done' && content.toLowerCase() === 'ok'
      return {
        ok, status: result.status, latencyMs: Date.now() - started, ...(result.cost !== undefined ? { cost: result.cost } : {}),
        ...(ok ? {} : { error: result.error ?? `Expected ${TEST_FILE} to contain "ok"` }), lastMessage: result.lastMessage.slice(0, 300)
      }
    } catch (error) {
      return { ok: false, status: 'failed', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }
    } finally {
      // Worktree depo yaninda (sandbox/.termflow-worktrees) oldugu icin sandbox ile birlikte gider.
      rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    }
  }

  api(): OrchestrationApi {
    return {
      agents: async () => this.report(),
      tasks: () => this.manager.list(),
      submit: (input) => this.manager.submit(input),
      wait: (id, ms) => this.manager.wait(id, ms),
      diff: (task) => taskDiff(task.worktreePath!, task.commit!),
      cancel: (id) => this.manager.cancel(id),
      discard: (id) => this.manager.discard(id)
    }
  }
}
