// Agent IDE Source Control + Checks (PRD 4.9, F2.3-F2.4): the user's own git and gh,
// always through execFile with an argument array, never a shell.

import { execFile } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { promisify } from 'util'
import type { GhOutcome, ScmAction, ScmCheck, ScmChecks, ScmCommit, ScmDiff, ScmFile, ScmState } from '../shared/ipc'
import { ghError } from './github'

const execFileAsync = promisify(execFile)
const MAX_PATHS = 2000

function isUsableDir(path: unknown): path is string {
  return typeof path === 'string' && isAbsolute(path) && existsSync(path) && statSync(path).isDirectory()
}

async function run(tool: 'git' | 'gh', args: string[], cwd: string, timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync(tool, args, { cwd, windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

/** `git status --porcelain=v1 -z --branch` -> branch, upstream, ahead/behind, files. */
export function parseScmStatus(stdout: string): Omit<ScmState, 'commits'> {
  const parts = stdout.split('\0')
  const header = (parts[0] ?? '').replace(/^##\s*/, '')
  let branch = 'HEAD'
  let upstream = ''
  if (header.startsWith('No commits yet on ')) branch = header.slice('No commits yet on '.length).trim()
  else if (!header.startsWith('HEAD (no branch)')) {
    const [names] = header.split(' [')
    ;[branch, upstream = ''] = (names ?? '').split('...')
  }
  const ahead = Number(/ahead (\d+)/.exec(header)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(header)?.[1] ?? 0)
  const files: ScmFile[] = []
  for (let i = 1; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry || entry.length < 4) continue
    files.push({ index: entry[0] ?? ' ', work: entry[1] ?? ' ', path: entry.slice(3) })
    // Rename/copy: the next NUL field is the original path.
    if ('RC'.includes(entry[0] ?? ' ') || entry[1] === 'R') i++
  }
  return { branch: branch.trim() || 'HEAD', upstream: upstream.trim(), ahead, behind, files }
}

/** `git log --format=%h%x1f%s%x1f%an%x1f%cr` lines -> commits. */
export function parseScmLog(stdout: string): ScmCommit[] {
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash = '', subject = '', author = '', when = ''] = line.split('\x1f')
    return { hash, subject, author, when }
  })
}

/** `gh pr checks --json name,state,link,workflow` -> checks. */
export function parseScmChecks(stdout: string): ScmCheck[] {
  const parsed = JSON.parse(stdout || '[]') as unknown
  if (!Array.isArray(parsed)) return []
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')
  return parsed.map((item: Record<string, unknown>) => ({ name: str(item.name), state: str(item.state), link: str(item.link), workflow: str(item.workflow) }))
}

/** Paths come from the renderer: strings only, never flag-like (they still go after `--`). */
export function validPaths(paths: unknown): string[] | null {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) return null
  return paths.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 1024 && !p.startsWith('-') && !p.includes('\0')) ? paths : null
}

export async function readScmState(cwd: string): Promise<ScmState | null> {
  if (!isUsableDir(cwd)) return null
  try {
    const status = parseScmStatus(await run('git', ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'], cwd))
    const log = await run('git', ['log', '-n', '30', '--format=%h%x1f%s%x1f%an%x1f%cr'], cwd).catch(() => '')
    return { ...status, commits: parseScmLog(log) }
  } catch {
    return null
  }
}

export async function runScmAction(cwd: string, action: ScmAction): Promise<GhOutcome> {
  if (!isUsableDir(cwd)) return { ok: false, error: 'Folder does not exist.' }
  try {
    switch (action?.kind) {
      case 'stage':
      case 'unstage': {
        const paths = validPaths(action.paths)
        if (!paths) return { ok: false, error: 'Invalid file list.' }
        await run('git', action.kind === 'stage' ? ['add', '-A', '--', ...paths] : ['reset', '-q', '--', ...paths], cwd)
        return { ok: true }
      }
      case 'commit': {
        const message = typeof action.message === 'string' ? action.message.trim() : ''
        if (!message || message.length > 10000) return { ok: false, error: 'Commit message is empty.' }
        await run('git', ['commit', '-m', message], cwd)
        return { ok: true }
      }
      case 'push': {
        const { upstream } = parseScmStatus(await run('git', ['status', '--porcelain=v1', '-z', '--branch'], cwd))
        // Publish Branch: no upstream yet, so push HEAD to origin and track it.
        await run('git', upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], cwd, 120000)
        return { ok: true }
      }
      case 'create-pr':
        await run('gh', ['pr', 'create', '--web'], cwd, 60000)
        return { ok: true }
      default:
        return { ok: false, error: 'Unknown action.' }
    }
  } catch (error) {
    return { ok: false, error: ghError(error) }
  }
}

export async function readScmChecks(cwd: string): Promise<ScmChecks> {
  if (!isUsableDir(cwd)) return { pr: false, checks: [] }
  try {
    return { pr: true, checks: parseScmChecks(await run('gh', ['pr', 'checks', '--json', 'name,state,link,workflow'], cwd, 30000)) }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string }
    // gh exits non-zero while checks are pending/failing but still prints the JSON.
    if (err.stdout?.trim().startsWith('[')) return { pr: true, checks: parseScmChecks(err.stdout) }
    if (/no pull requests? found|no checks reported/i.test(err.stderr ?? '')) return { pr: /no checks/i.test(err.stderr ?? ''), checks: [] }
    return { pr: false, checks: [], error: ghError(error) }
  }
}

const MAX_DIFF_BYTES = 4 * 1024 * 1024
const MAX_UNTRACKED = 200
const MAX_UNTRACKED_BYTES = 256 * 1024

/** A base ref from the renderer: a plain ref name, never an option or a range. */
export function validRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[\w./@{}^~-]{1,200}$/.test(ref) && !ref.startsWith('-') && !ref.includes('..')
}

/** Untracked file -> a `git diff`-style "new file" section, so the viewer sees one format. */
export function untrackedDiff(path: string, content: Buffer | null): string {
  const head = `diff --git a/${path} b/${path}\nnew file mode 100644\n`
  if (content === null) return `${head}Binary files /dev/null and b/${path} differ\n`
  if (content.length === 0) return head
  const lines = content.toString('utf8').replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return `${head}--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`
}

/** Local and remote branch names for the "Compare with" picker (Change Base Ref). */
export async function listScmRefs(cwd: string): Promise<string[]> {
  if (!isUsableDir(cwd)) return []
  const out = await run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], cwd).catch(() => '')
  return out.split(/\r?\n/).filter((ref) => ref && !ref.endsWith('/HEAD'))
}

/**
 * Working tree diff for the review page (F4.1). Empty base = against HEAD (staged + unstaged);
 * a base ref = against its merge-base with HEAD, i.e. everything this branch adds (Change Base Ref).
 */
export async function readScmDiff(cwd: string, base: string): Promise<ScmDiff> {
  if (!isUsableDir(cwd)) return { text: '', error: 'Folder does not exist.' }
  if (base && !validRef(base)) return { text: '', error: 'Invalid base ref.' }
  try {
    const hasHead = await run('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], cwd).then(() => true, () => false)
    const from = base && hasHead ? (await run('git', ['merge-base', 'HEAD', base], cwd)).trim() : 'HEAD'
    // No commit yet: everything staged is new, so compare the index instead.
    const args = hasHead ? ['diff', '--no-color', '--no-ext-diff', '-M', from] : ['diff', '--no-color', '--no-ext-diff', '--cached']
    let text = await run('git', args, cwd, 30000)
    const others = (await run('git', ['ls-files', '--others', '--exclude-standard', '-z'], cwd)).split('\0').filter(Boolean)
    const root = resolve(cwd)
    for (const path of others.slice(0, MAX_UNTRACKED)) {
      const full = resolve(join(cwd, path))
      if (relative(root, full).startsWith('..')) continue
      let content: Buffer | null = null
      try {
        content = statSync(full).size > MAX_UNTRACKED_BYTES ? null : readFileSync(full)
        if (content?.includes(0)) content = null
      } catch { continue }
      text += untrackedDiff(path.replace(/\\/g, '/'), content)
    }
    const truncated = text.length > MAX_DIFF_BYTES || others.length > MAX_UNTRACKED
    return { text: text.slice(0, MAX_DIFF_BYTES), truncated, base: base || undefined }
  } catch (error) {
    return { text: '', error: ghError(error) }
  }
}
