import { create } from 'zustand'

/** Agent IDE orta sutun sayfalari (PRD F3.1-F3.4, F4.1-F4.4); terminaller altta canli kalir. */
export type IdePage = 'tasks' | 'automations' | 'mobile' | 'artifacts' | 'review' | 'notes'

/** Review / Notes hangi worktree icin acildi; `file` = diff'te once gosterilecek dosya. */
export interface IdePageContext { cwd?: string; file?: string }

export const useIdePageStore = create<{ page: IdePage | null; context: IdePageContext; open(page: IdePage, context?: IdePageContext): void; close(): void }>()((set) => ({
  page: null,
  context: {},
  open: (page, context = {}) => set({ page, context }),
  close: () => set({ page: null, context: {} })
}))
