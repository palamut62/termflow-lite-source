import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ReviewComment } from './diffModel'

/** F4.2: yorumlar worktree basina birikir (bellekte, oturum boyunca); "Send to agent" sonrasi temizlenir. */
interface ReviewState {
  byCwd: Record<string, ReviewComment[]>
  add(cwd: string, comment: Omit<ReviewComment, 'id'>): void
  update(cwd: string, id: string, body: string): void
  remove(cwd: string, id: string): void
  clear(cwd: string): void
}

export const useReviewStore = create<ReviewState>()((set) => ({
  byCwd: {},
  add: (cwd, comment) => set((s) => ({ byCwd: { ...s.byCwd, [cwd]: [...(s.byCwd[cwd] ?? []), { ...comment, id: nanoid(8) }] } })),
  update: (cwd, id, body) => set((s) => ({ byCwd: { ...s.byCwd, [cwd]: (s.byCwd[cwd] ?? []).map((c) => (c.id === id ? { ...c, body } : c)) } })),
  remove: (cwd, id) => set((s) => ({ byCwd: { ...s.byCwd, [cwd]: (s.byCwd[cwd] ?? []).filter((c) => c.id !== id) } })),
  clear: (cwd) => set((s) => ({ byCwd: { ...s.byCwd, [cwd]: [] } }))
}))
