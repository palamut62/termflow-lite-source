// Worktree kurulum adimlari (docs/orca-parity/worktree-setup.md): yeni checkout'a depodan dosya
// kopyalama ve ajan baslamadan once kurulum komutlari.

import { execFile, spawn, type ChildProcess } from 'child_process'
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'fs'
import { dirname, join, relative, isAbsolute } from 'path'
import { isSafeCopyPattern } from '../shared/worktreeSetup'

export const STEP_TIMEOUT_MS = 10 * 60_000

function globRegex(name: string): RegExp {
  const source = name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${source}$`, process.platform === 'win32' ? 'i' : '')
}

/** Desenler -> kokteki duzenli dosyalar (goreli yol). Sembolik link ve koku terk eden klasor yolu alinmaz. */
export function expandCopyPatterns(repoRoot: string, patterns: string[]): string[] {
  const realRoot = realpathSync(repoRoot)
  const files = new Set<string>()
  for (const pattern of patterns) {
    if (!isSafeCopyPattern(pattern)) continue
    const parts = pattern.trim().split(/[\\/]/)
    const name = parts.pop()!
    const dir = join(repoRoot, ...parts)
    let names: string[]
    try {
      names = /[*?]/.test(name) ? readdirSync(dir).filter((entry) => globRegex(name).test(entry)) : [name]
    } catch {
      continue
    }
    for (const entry of names) {
      const full = join(dir, entry)
      try {
        if (!lstatSync(full).isFile()) continue
        // Klasor parcasi bir link olabilir: gercek yol hala kokun icinde olmali.
        const fromRoot = relative(realRoot, realpathSync(full))
        if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) continue
        files.add(relative(repoRoot, full))
      } catch {
        // Dosya yok: desen eslesmedi, adim basarisiz sayilmaz.
      }
    }
  }
  return [...files]
}

/** Hedefte zaten olan dosya ezilmez (worktree'de izlenen `.env.example` gibi). */
export function copySetupFiles(repoRoot: string, worktreePath: string, patterns: string[]): { copied: string[]; skipped: string[] } {
  const copied: string[] = []
  const skipped: string[] = []
  for (const file of expandCopyPatterns(repoRoot, patterns)) {
    const target = join(worktreePath, file)
    if (existsSync(target)) {
      skipped.push(file)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(repoRoot, file), target, constants.COPYFILE_EXCL)
    copied.push(file)
  }
  return { copied, skipped }
}

export interface SetupCommandRun {
  done: Promise<{ code: number | null; timedOut: boolean }>
  cancel(): void
}

/** Surec ve tum alt surecleri; Unix'te cocuk `detached: true` ile baslatilmis olmali (kendi grubu). */
export function killProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  else {
    try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
  }
}

/** Sistem kabugunda (Windows cmd, digerleri sh) tek komut; cikti parca parca gelir. */
export function runSetupCommand(command: string, cwd: string, onOutput: (text: string) => void, timeoutMs = STEP_TIMEOUT_MS): SetupCommandRun {
  const windows = process.platform === 'win32'
  // Unix'te kendi surec grubu: iptal npm'in alt sureclerini de durdursun.
  const child = spawn(command, { cwd, shell: true, windowsHide: true, detached: !windows })
  const kill = (): void => killProcessTree(child)
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; kill() }, timeoutMs)
  child.stdout.on('data', (chunk: Buffer) => onOutput(chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => onOutput(chunk.toString()))
  const done = new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    child.on('error', (error) => {
      onOutput(`${error.message}\n`)
      clearTimeout(timer)
      resolve({ code: null, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, timedOut })
    })
  })
  return { done, cancel: kill }
}
