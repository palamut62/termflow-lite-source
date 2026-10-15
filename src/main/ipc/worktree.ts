import { existsSync, readdirSync, statSync } from 'fs'
import { isAbsolute } from 'path'
import { ipcMain } from 'electron'
import {
  IPC,
  type GitRepoInfo,
  type WorktreeCreateRequest,
  type WorktreeEntry,
  type WorktreeOutcome,
  type WorktreeRemoveOutcome,
  type WorktreeRemoveRequest,
  type WorktreeSetupOutcome,
  type WorktreeSetupRequest
} from '../../shared/ipc'
import { normalizeSetupSteps, suggestSetup } from '../../shared/worktreeSetup'
import { redactApiKeys, stripAnsi } from '../../shared/secretRedaction'
import { createWorktree, listWorktrees, normalizePath, readRepoInfo, removeWorktree } from '../worktree'
import { copySetupFiles, runSetupCommand, type SetupCommandRun } from '../worktreeSetup'

const isDir = (path: unknown): path is string =>
  typeof path === 'string' && isAbsolute(path) && existsSync(path) && statSync(path).isDirectory()

/** Calisan kurulumlarin iptali: runId -> iptal. */
const setupRuns = new Map<string, () => void>()

/**
 * Worktree isolation channels (Cube-style "a worktree per agent"). Every
 * handler validates its own payload: the renderer is sandboxed but these
 * commands touch the filesystem, so nothing is trusted by shape alone.
 */
export function registerWorktreeIpc(): void {
  ipcMain.handle(IPC.WORKTREE_REPO_INFO, async (_event, cwd: string): Promise<GitRepoInfo | null> => {
    if (typeof cwd !== 'string') return null
    return readRepoInfo(cwd)
  })

  ipcMain.handle(IPC.WORKTREE_LIST, async (_event, repoRoot: string): Promise<WorktreeEntry[]> => {
    if (typeof repoRoot !== 'string') return []
    return listWorktrees(repoRoot)
  })

  ipcMain.handle(IPC.WORKTREE_CREATE, async (_event, request: WorktreeCreateRequest): Promise<WorktreeOutcome> => {
    if (!request || typeof request.repoRoot !== 'string' || typeof request.branch !== 'string') {
      return { ok: false, error: 'Invalid worktree request.' }
    }
    return createWorktree({
      repoRoot: request.repoRoot,
      branch: request.branch,
      baseRef: typeof request.baseRef === 'string' ? request.baseRef : undefined,
      path: typeof request.path === 'string' ? request.path : undefined,
      detach: request.detach === true,
      sparsePaths: request.sparsePaths
    })
  })

  ipcMain.handle(IPC.WORKTREE_REMOVE, async (_event, request: WorktreeRemoveRequest): Promise<WorktreeRemoveOutcome> => {
    if (!request || typeof request.repoRoot !== 'string' || typeof request.path !== 'string') {
      return { ok: false, error: 'Invalid worktree request.' }
    }
    return removeWorktree({
      repoRoot: request.repoRoot,
      path: request.path,
      force: request.force === true,
      deleteBranch: request.deleteBranch === true,
      branch: typeof request.branch === 'string' ? request.branch : undefined
    })
  })

  ipcMain.handle(IPC.WORKTREE_SETUP_SUGGEST, (_event, repoRoot: unknown) => {
    try {
      return isDir(repoRoot) ? suggestSetup(readdirSync(repoRoot)) : suggestSetup([])
    } catch {
      return suggestSetup([])
    }
  })

  ipcMain.handle(IPC.WORKTREE_SETUP_RUN, async (event, request: WorktreeSetupRequest): Promise<WorktreeSetupOutcome> => {
    const steps = normalizeSetupSteps(request?.steps)
    if (!steps || typeof request.runId !== 'string' || !isDir(request.repoRoot) || !isDir(request.worktreePath)) {
      return { ok: false, step: 0, error: 'Invalid setup request.' }
    }
    const { runId, repoRoot, worktreePath } = request
    // Yalniz bu deponun worktree'sine yazilir; ana calisma agaci da hedef olamaz.
    const trees = await listWorktrees(repoRoot)
    const target = normalizePath(worktreePath)
    if (!trees.slice(1).some((entry) => normalizePath(entry.path) === target)) {
      return { ok: false, step: 0, error: 'Not a worktree of this repository.' }
    }
    const send = (text: string): void => { if (!event.sender.isDestroyed()) event.sender.send(IPC.WORKTREE_SETUP_OUTPUT, runId, redactApiKeys(stripAnsi(text))) }
    let cancelled = false
    let current: SetupCommandRun | null = null
    setupRuns.set(runId, () => { cancelled = true; current?.cancel() })
    try {
      if (steps.copyFiles.length > 0) {
        try {
          const { copied, skipped } = copySetupFiles(repoRoot, worktreePath, steps.copyFiles)
          send(`Copied ${copied.length} file(s)${copied.length ? `: ${copied.join(', ')}` : ''}${skipped.length ? ` (already there: ${skipped.join(', ')})` : ''}
`)
        } catch (error) {
          return { ok: false, step: 0, error: `Copying files failed: ${(error as Error).message}` }
        }
      }
      for (const [index, command] of steps.commands.entries()) {
        if (cancelled) return { ok: false, step: index + 1, error: 'Cancelled.' }
        send(`
$ ${command}
`)
        current = runSetupCommand(command, worktreePath, send)
        const result = await current.done
        if (cancelled) return { ok: false, step: index + 1, error: 'Cancelled.' }
        if (result.timedOut) return { ok: false, step: index + 1, error: 'Timed out after 10 minutes.' }
        if (result.code !== 0) return { ok: false, step: index + 1, error: `Exited with code ${result.code ?? 'unknown'}.` }
      }
      return { ok: true }
    } finally {
      setupRuns.delete(runId)
    }
  })

  ipcMain.on(IPC.WORKTREE_SETUP_CANCEL, (_event, runId: unknown) => {
    if (typeof runId === 'string') setupRuns.get(runId)?.()
  })
}
