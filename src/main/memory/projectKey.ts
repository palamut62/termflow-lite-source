import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { basename, dirname, resolve } from 'path'

// Electron'a bağımlı değil: MCP sunucusu da (ELECTRON_RUN_AS_NODE) bunu kullanır.

const gitRoots = new Map<string, string>()

/** Yolu karşılaştırılabilir biçime getirir: mutlak, ayraç sonu yok, Windows'ta küçük harf. */
export function normalizePath(path: string, platform: NodeJS.Platform = process.platform): string {
  const absolute = resolve(path).replace(/[\\/]+$/, '')
  const trimmed = absolute || resolve(path)
  return platform === 'win32' ? trimmed.replace(/\//g, '\\').toLowerCase() : trimmed
}

/** Session klasörünü içeren git kökü; git deposu değilse klasörün kendisi. */
export function projectRoot(cwd: string): string {
  const start = resolve(cwd)
  const cached = gitRoots.get(start)
  if (cached) return cached
  let current = start
  let root = start
  for (;;) {
    if (existsSync(resolve(current, '.git'))) {
      root = current
      break
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  gitRoots.set(start, root)
  return root
}

/** Projeyi tanımlayan kalıcı anahtar (normalize edilmiş kök yol). */
export function projectKey(cwd: string): string {
  return normalizePath(projectRoot(cwd))
}

/** Dosya adı: okunur klasör adı + yol özeti. */
export function projectSlug(key: string): string {
  const name = basename(key).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project'
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 8)
  return `${name}-${hash}`
}

export function clearProjectRootCache(): void {
  gitRoots.clear()
}
