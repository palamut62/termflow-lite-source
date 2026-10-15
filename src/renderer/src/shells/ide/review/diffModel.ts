/** Agent IDE review page (PRD F4.1-F4.2): unified git diff -> files/hunks/lines, split rows, review prompt. */

export type DiffLineKind = 'add' | 'del' | 'ctx'
export interface DiffLine { kind: DiffLineKind; text: string; oldNo?: number; newNo?: number }
export interface DiffHunk { header: string; lines: DiffLine[] }
export type DiffStatus = 'modified' | 'added' | 'deleted' | 'renamed'
export interface DiffFile { path: string; oldPath?: string; status: DiffStatus; binary: boolean; hunks: DiffHunk[]; additions: number; deletions: number }

/** `a/x` / `b/x` / `/dev/null` -> path, or '' for /dev/null. */
function stripPrefix(raw: string): string {
  const path = raw.trim().replace(/^"(.*)"$/, '$1')
  if (path === '/dev/null') return ''
  return path.replace(/^[ab]\//, '')
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line)
      file = { path: match?.[2] ?? line.slice(11), status: 'modified', binary: false, hunks: [], additions: 0, deletions: 0 }
      files.push(file)
      hunk = null
      continue
    }
    if (!file) continue
    if (!hunk) {
      if (line.startsWith('new file mode')) file.status = 'added'
      else if (line.startsWith('deleted file mode')) file.status = 'deleted'
      else if (line.startsWith('rename from ')) { file.oldPath = line.slice(12); file.status = 'renamed' }
      else if (line.startsWith('rename to ')) file.path = line.slice(10)
      else if (line.startsWith('Binary files ')) file.binary = true
      else if (line.startsWith('--- ')) { const from = stripPrefix(line.slice(4)); if (from && from !== file.path && file.status !== 'renamed') file.oldPath = from }
      else if (line.startsWith('+++ ')) { const to = stripPrefix(line.slice(4)); if (to) file.path = to }
    }
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      oldNo = Number(header[1])
      newNo = Number(header[2])
      hunk = { header: line, lines: [] }
      file.hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    if (line.startsWith('+')) { hunk.lines.push({ kind: 'add', text: line.slice(1), newNo: newNo++ }); file.additions++ }
    else if (line.startsWith('-')) { hunk.lines.push({ kind: 'del', text: line.slice(1), oldNo: oldNo++ }); file.deletions++ }
    else if (line.startsWith(' ')) hunk.lines.push({ kind: 'ctx', text: line.slice(1), oldNo: oldNo++, newNo: newNo++ })
    // "\ No newline at end of file" and the trailing empty line carry no content.
  }
  return files
}

/** Side-by-side rows: deletions pair with the additions that follow them; context sits on both sides. */
export interface SplitRow { left?: DiffLine; right?: DiffLine }
export function splitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  const lines = hunk.lines
  while (i < lines.length) {
    const line = lines[i]!
    if (line.kind === 'ctx') { rows.push({ left: line, right: line }); i++; continue }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i]!.kind === 'del') dels.push(lines[i++]!)
    while (i < lines.length && lines[i]!.kind === 'add') adds.push(lines[i++]!)
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] })
  }
  return rows
}

/** A review comment anchored to one diff line; `side` says which line number it refers to. */
export interface ReviewComment { id: string; path: string; line: number; side: 'old' | 'new'; code: string; body: string }

export function lineAnchor(line: DiffLine): { line: number; side: 'old' | 'new' } {
  return line.kind === 'del' ? { line: line.oldNo ?? 0, side: 'old' } : { line: line.newNo ?? 0, side: 'new' }
}

/** All comments as one prompt for the agent (F4.2 "Send to agent"), grouped by file in line order. */
export function formatReviewPrompt(comments: readonly ReviewComment[], base?: string): string {
  const byFile = new Map<string, ReviewComment[]>()
  for (const c of comments) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c])
  const parts = [`Please address these review comments on the ${base ? `changes against ${base}` : 'uncommitted changes'} in this worktree:`]
  for (const [path, list] of byFile) {
    parts.push('', `## ${path}`)
    for (const c of [...list].sort((a, b) => a.line - b.line)) {
      parts.push('', `- ${c.side === 'old' ? 'Removed line' : 'Line'} ${c.line}: \`${c.code.trim().slice(0, 200)}\``, ...c.body.trim().split('\n').map((l) => `  ${l}`))
    }
  }
  return parts.join('\n')
}
