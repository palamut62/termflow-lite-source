import { useEffect, useMemo, useState } from 'react'
import type { TerminalTab } from '../../shared/types'

/**
 * Sekme klasoru -> git deposu koku. Her klasor bir kez sorulur; depo olmayan klasor kendisine eslenir.
 * SessionRail ve Agent IDE agaci ayni cozumlemeyi kullanir.
 */
export function useRepoRoots(tabs: readonly TerminalTab[]): Map<string, string> {
  const [repoRoots, setRepoRoots] = useState<Map<string, string>>(new Map())

  // Distinct launch directories that still need a repository lookup.
  const pendingPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const tab of tabs) {
      const cwd = tab.worktree ? '' : tab.launchCwd || tab.cwd || ''
      if (cwd && !repoRoots.has(cwd)) paths.add(cwd)
    }
    return [...paths]
  }, [tabs, repoRoots])

  useEffect(() => {
    if (pendingPaths.length === 0) return
    let cancelled = false
    void (async () => {
      const resolved: [string, string][] = []
      for (const path of pendingPaths) {
        const info = await window.termflow.worktree.repoInfo(path)
        // Cache the miss as the path itself so a non-repo folder is asked once.
        resolved.push([path, info?.root ?? path])
      }
      if (cancelled) return
      setRepoRoots((previous) => {
        const next = new Map(previous)
        for (const [key, value] of resolved) next.set(key, value)
        return next
      })
    })()
    return () => { cancelled = true }
  }, [pendingPaths])

  return repoRoots
}
