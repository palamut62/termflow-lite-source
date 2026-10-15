// Agent IDE Explorer "Contents" search (PRD 4.9) through `git grep`: honours .gitignore,
// skips binaries, and also works outside a repository with --no-index.

import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { isAbsolute, join } from 'path'
import type { FileSearchFile, FileSearchQuery, FileSearchResult } from '../shared/ipc'

const MAX_MATCHES = 2000
const MAX_LINE = 300

/** `git grep -n -z` output (`path\0line\0text\n`) grouped by file, capped at MAX_MATCHES. */
export function parseGrep(stdout: string, root: string): FileSearchResult {
  const files = new Map<string, FileSearchFile>()
  let count = 0
  for (const row of stdout.split('\n')) {
    const [path, line, ...rest] = row.split('\0')
    if (!path || !line) continue
    if (count >= MAX_MATCHES) return { files: [...files.values()], truncated: true }
    let file = files.get(path)
    if (!file) files.set(path, (file = { path, absolute: join(root, path), matches: [] }))
    file.matches.push({ line: Number(line), text: rest.join('\0').trim().slice(0, MAX_LINE) })
    count++
  }
  return { files: [...files.values()], truncated: false }
}

/** "src/**, *.ts" -> git pathspecs; a glob without `/` matches in any folder. */
export function pathspecs(include: string, exclude: string): string[] {
  const split = (value: string): string[] => value.split(',').map((g) => g.trim()).filter((g) => g && !g.startsWith('-') && !g.includes('\0'))
  const glob = (g: string): string => (g.includes('/') ? g : `**/${g}`)
  const specs = [
    ...split(include).map((g) => `:(glob)${glob(g)}`),
    ...split(exclude).map((g) => `:(exclude,glob)${glob(g)}`)
  ]
  // Exclude-only pathspecs need a positive one to subtract from.
  return specs.some((s) => !s.startsWith(':(exclude')) ? specs : ['.', ...specs]
}

function grep(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : -1) : 0
      resolve({ code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

export async function searchFiles(cwd: unknown, query: FileSearchQuery): Promise<FileSearchResult> {
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) return { files: [], truncated: false, error: 'Folder does not exist.' }
  const text = typeof query?.text === 'string' ? query.text : ''
  if (!text || text.length > 1000) return { files: [], truncated: false }
  const flags = ['-n', '-z', '-I', '--no-color',
    ...(query.caseSensitive ? [] : ['-i']), ...(query.word ? ['-w'] : []), query.regex ? '-E' : '-F', '-e', text,
    '--', ...pathspecs(String(query.include ?? ''), String(query.exclude ?? ''))]
  let run = await grep(['grep', '--untracked', ...flags], cwd)
  if (run.code === 128 && /not a git repository/i.test(run.stderr)) run = await grep(['grep', '--no-index', '--exclude-standard', ...flags], cwd)
  // 1 = no match; anything else non-zero is a real error (bad regex, git missing).
  if (run.code !== 0 && run.code !== 1) {
    const message = run.code === -1 && !run.stdout ? 'Search failed (is git installed?).' : run.stderr.trim().split(/\r?\n/)[0]?.replace(/^fatal:\s*/, '') || 'Search failed.'
    if (!run.stdout) return { files: [], truncated: false, error: message.slice(0, 300) }
  }
  return parseGrep(run.stdout, cwd)
}
