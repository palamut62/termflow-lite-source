import { create } from 'zustand'

/**
 * Agent IDE (Orca): sekme seridi yalniz etkin worktree'nin sekmelerini gosterir. Sekme -> worktree eslemesi
 * proje agacindan gelir (ProjectTree yayinlar); hicbir projeye ait olmayan sekmeler '' kapsaminda toplanir.
 */
export const useWorkspaceScopeStore = create<{ byTab: ReadonlyMap<string, string>; set(byTab: ReadonlyMap<string, string>): void }>()((set) => ({
  byTab: new Map(),
  set: (byTab) => set({ byTab })
}))

const scopeOf = (byTab: ReadonlyMap<string, string>, tabId: string | null): string => (tabId ? byTab.get(tabId) ?? '' : '')

/** Etkin sekmeyle ayni worktree'deki sekmeler, seritteki sirayla. */
export function scopedTabs<T extends { id: string }>(tabs: readonly T[], byTab: ReadonlyMap<string, string>, activeTabId: string | null): T[] {
  const scope = scopeOf(byTab, activeTabId)
  return tabs.filter((tab) => scopeOf(byTab, tab.id) === scope)
}

/** Worktree'ye gecince acilacak sekme: en son bakilan, yoksa ilki (Orca da son sekmeye doner). */
export function lastUsedTab(tabIds: readonly string[], lastSeen: ReadonlyMap<string, number>): string | undefined {
  let best: string | undefined
  for (const id of tabIds) if (best === undefined || (lastSeen.get(id) ?? 0) > (lastSeen.get(best) ?? 0)) best = id
  return best
}

/** Esleme icerikce ayni mi; ayniysa store guncellenmez, serit bosuna yeniden cizilmez. */
export function scopeMapEquals(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) if (b.get(key) !== value) return false
  return true
}
