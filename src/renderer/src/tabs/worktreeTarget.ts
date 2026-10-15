/**
 * Create worktree "Smart" girisi (Orca, PRD F2.1): `#123` ya da PR URL'si = o PR'i checkout et,
 * issue URL'si = `issue-123` dali, aksi halde dal adi (varsa mevcut dal acilir, yoksa yeni dal).
 */
export type WorktreeTarget =
  | { kind: 'pr'; number: number; repo?: string }
  | { kind: 'branch'; branch: string; issue?: number }

export function parseWorktreeTarget(input: string): WorktreeTarget | null {
  const text = input.trim()
  if (!text) return null
  const hash = /^#(\d+)$/.exec(text)
  if (hash) return { kind: 'pr', number: Number(hash[1]) }
  const url = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues)\/(\d+)/i.exec(text)
  if (url) {
    const number = Number(url[3])
    return url[2]?.toLowerCase() === 'pull' ? { kind: 'pr', number, repo: url[1] } : { kind: 'branch', branch: `issue-${number}`, issue: number }
  }
  return { kind: 'branch', branch: text }
}

export function describeTarget(target: WorktreeTarget | null): string {
  if (!target) return 'Type a name, an existing branch, #123 or a GitHub issue / PR URL.'
  if (target.kind === 'pr') return `Checks out pull request #${target.number}${target.repo ? ` of ${target.repo}` : ''} with gh.`
  return target.issue ? `New branch ${target.branch} for issue #${target.issue}.` : `Branch ${target.branch} (opened if it exists, created otherwise).`
}
