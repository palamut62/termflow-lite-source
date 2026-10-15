import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { isAbsolute } from 'path'
import { promisify } from 'util'
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { IPC, type GhOutcome, type GitStatus, type ScmAction, type ScmChecks, type ScmDiff, type ScmState } from '../../shared/ipc'
import { listScmRefs, readScmChecks, readScmDiff, readScmState, runScmAction } from '../scm'
import { readNote, writeNote } from '../notes'

const execFileAsync = promisify(execFile)

export function parseGitStatus(stdout: string): GitStatus {
  const lines = stdout.trimEnd().split(/\r?\n/)
  const header = lines[0]?.replace(/^##\s*/, '') ?? ''
  const branch = header.startsWith('No commits yet on ')
    ? header.slice('No commits yet on '.length).trim()
    : header.split('...')[0]?.split(' ')[0]?.trim() || 'HEAD'
  return { branch, changedFiles: lines.slice(1).filter(Boolean).length }
}

export function registerGitIpc(): void {
  ipcMain.handle(IPC.GIT_STATUS, async (_event, cwd: string): Promise<GitStatus | null> => {
    try {
      if (typeof cwd !== 'string' || !isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) return null
      const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--branch'], {
        cwd,
        windowsHide: true,
        timeout: 2500,
        maxBuffer: 256 * 1024
      })
      return parseGitStatus(stdout)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.SCM_STATE, async (_event, cwd: string): Promise<ScmState | null> => readScmState(cwd))
  ipcMain.handle(IPC.SCM_RUN, async (_event, cwd: string, action: ScmAction): Promise<GhOutcome> => runScmAction(cwd, action))
  ipcMain.handle(IPC.SCM_CHECKS, async (_event, cwd: string): Promise<ScmChecks> => readScmChecks(cwd))
  ipcMain.handle(IPC.SCM_DIFF, async (_event, cwd: string, base: string): Promise<ScmDiff> => readScmDiff(cwd, typeof base === 'string' ? base : ''))
  ipcMain.handle(IPC.SCM_REFS, async (_event, cwd: string): Promise<string[]> => listScmRefs(cwd))
  const notesDir = (): string => join(app.getPath('userData'), 'notes')
  ipcMain.handle(IPC.NOTES_READ, (_event, path: string): string => readNote(notesDir(), path))
  ipcMain.handle(IPC.NOTES_WRITE, (_event, path: string, text: string): boolean => writeNote(notesDir(), path, text))
}
