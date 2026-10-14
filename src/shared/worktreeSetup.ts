// Worktree kurulum adimlari (docs/orca-parity/worktree-setup.md). Arayuz kaydederken, ana surec
// calistirirken ayni kurali kullanir.

export interface WorktreeSetupSteps {
  /** Depo kokune gore goreli yollar; son parcada `*` / `?` olabilir (`.env*`). */
  copyFiles: string[]
  /** Yeni worktree klasorunde sirayla calisir. */
  commands: string[]
  enabled: boolean
}

const MAX_ITEMS = 50

/** Ayar anahtari: ayni depo `C:\x` ve `c:/x/` diye iki kayit olmasin. */
export function setupKey(repoRoot: string): string {
  return repoRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Kok icinde kalan goreli yol; mutlak, `~`, `..`, surucu/akis (`:`) ve klasor parcasinda glob reddedilir. */
export function isSafeCopyPattern(pattern: string): boolean {
  const value = pattern.trim()
  if (!value || value.length > 260 || value.includes(':') || /^[\\/~]/.test(value)) return false
  const parts = value.split(/[\\/]/)
  if (parts.some((part) => part === '..' || part === '')) return false
  return parts.slice(0, -1).every((part) => !/[*?]/.test(part))
}

/** Kok klasordeki dosya adlarina gore oneri; kaydedilmeden calismaz. */
export function suggestSetup(rootFiles: string[]): Pick<WorktreeSetupSteps, 'copyFiles' | 'commands'> {
  const has = (name: string): boolean => rootFiles.includes(name)
  const commands: string[] = []
  if (has('package-lock.json')) commands.push('npm ci')
  else if (has('pnpm-lock.yaml')) commands.push('pnpm install')
  if (has('requirements.txt')) commands.push('pip install -r requirements.txt')
  return { copyFiles: rootFiles.some((name) => name.startsWith('.env')) ? ['.env*'] : [], commands }
}

function lines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, MAX_ITEMS)
}

/** Disaridan gelen (settings.json / IPC) adimlar; guvensiz kopyalama yolu duser. */
export function normalizeSetupSteps(value: unknown): WorktreeSetupSteps | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  return { copyFiles: lines(input.copyFiles).filter(isSafeCopyPattern), commands: lines(input.commands), enabled: input.enabled !== false }
}
