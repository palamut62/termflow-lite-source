import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { worktreeKey, type WorktreeMeta, type WorktreeStatus } from '../../../../shared/types'
import { useSettingsStore } from '../../store/settingsStore'
import { STATUSES, STATUS_LABELS, type IdeProject, type IdeWorktree } from './ideTreeModel'

/** Worktree kullanici verisini birlestirir; bos alanlar silinir (ayar dosyasi sismesin). */
export function saveWorktreeMeta(path: string, patch: Partial<WorktreeMeta>): void {
  const ide = useSettingsStore.getState().settings.ide
  const key = worktreeKey(path)
  const merged = { ...ide.worktreeMeta[key], ...patch }
  const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined && v !== '' && v !== false)) as WorktreeMeta
  const worktreeMeta = { ...ide.worktreeMeta }
  if (Object.keys(clean).length) worktreeMeta[key] = clean
  else delete worktreeMeta[key]
  void useSettingsStore.getState().update({ ide: { ...ide, worktreeMeta } })
}

export const folderName = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path

/** Orca "Workspace details" (kart menusu > Update): gorunen ad, bagli is, not, durum, parent. */
export function WorktreeDetailsDialog({ project, worktree, onClose }: { project: IdeProject; worktree: IdeWorktree; onClose: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState<WorktreeMeta>(worktree.meta)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { panelRef.current?.querySelector('input')?.focus() }, [])
  const set = (patch: Partial<WorktreeMeta>): void => setDraft((d) => ({ ...d, ...patch }))
  // Parent adayi: ayni projedeki diger alt worktree'ler (ana checkout zaten herkesin ustu).
  const parents = [...project.worktrees, ...project.hidden].filter((w) => !w.primary && worktreeKey(w.path) !== worktreeKey(worktree.path))
  const save = (): void => {
    saveWorktreeMeta(worktree.path, { name: draft.name?.trim(), link: draft.link?.trim(), note: draft.note, status: draft.status, parent: draft.parent || undefined })
    onClose()
  }

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={panelRef}
        className="ide-dialog ide-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worktree-details-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
          if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); save() }
        }}
      >
        <header className="ide-dialog-head">
          <div>
            <h2 id="worktree-details-title">Workspace details</h2>
            <span title={worktree.path}>{worktree.branch ?? folderName(worktree.path)} - {project.label}</span>
          </div>
          <button className="ide-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>
        <label className="ide-field">
          <span>Display name</span>
          <input value={draft.name ?? ''} maxLength={120} placeholder={folderName(worktree.path)} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="ide-field">
          <span>Linked work</span>
          <input value={draft.link ?? ''} maxLength={2000} placeholder="Issue or PR URL, #123, ticket key" onChange={(e) => set({ link: e.target.value })} />
        </label>
        <div className="ide-field-row">
          <label className="ide-field">
            <span>Status</span>
            <select value={draft.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as WorktreeStatus | undefined })}>
              <option value="">No status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          {!worktree.primary && (
            <label className="ide-field">
              <span>Parent worktree</span>
              <select value={draft.parent ? worktreeKey(draft.parent) : ''} onChange={(e) => set({ parent: parents.find((p) => worktreeKey(p.path) === e.target.value)?.path })}>
                <option value="">{project.label} (primary)</option>
                {parents.map((p) => <option key={p.path} value={worktreeKey(p.path)}>{p.meta.name || p.branch || folderName(p.path)}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="ide-field">
          <span>Note (Markdown)</span>
          <textarea value={draft.note ?? ''} rows={6} maxLength={20000} placeholder="What is this workspace for?" onChange={(e) => set({ note: e.target.value })} />
        </label>
        <footer className="ide-dialog-foot">
          <button className="settings-btn" onClick={onClose}>Cancel</button>
          <button className="settings-btn settings-btn-primary" onClick={save}>Save</button>
        </footer>
      </div>
    </div>
  )
}
