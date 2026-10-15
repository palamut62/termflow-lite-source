import { useEffect, useRef, useState } from 'react'
import { Pin, Search, X } from 'lucide-react'
import type { WorktreeStatus } from '../../../../shared/types'
import { STATUSES, STATUS_LABELS, mostUrgent, type IdeProject, type IdeWorktree } from './ideTreeModel'
import { folderName, saveWorktreeMeta } from './WorktreeDetailsDialog'

type Column = WorktreeStatus | 'pinned'
const COLUMNS: { id: Column; label: string }[] = [{ id: 'pinned', label: 'Pinned' }, ...STATUSES.map((id) => ({ id, label: STATUS_LABELS[id] }))]
const columnOf = (w: IdeWorktree): Column => (w.meta.pinned ? 'pinned' : w.meta.status ?? 'todo')

function move(worktree: IdeWorktree, to: Column): void {
  saveWorktreeMeta(worktree.path, to === 'pinned' ? { pinned: true } : { pinned: undefined, status: to })
}

/** Orca Workspace board: worktree'ler durum sutunlarinda; surukle-birak ya da kart uzerindeki secici ile tasinir. */
export function WorkspaceBoard({ projects, onOpen, onClose }: { projects: IdeProject[]; onOpen: (w: IdeWorktree) => void; onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Column | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { panelRef.current?.querySelector('input')?.focus() }, [])

  const q = query.trim().toLowerCase()
  const cards = projects.flatMap((project) => project.worktrees.map((worktree) => ({ project, worktree })))
    .filter(({ project, worktree }) => !q || `${worktree.meta.name ?? ''} ${worktree.branch ?? ''} ${project.label} ${worktree.meta.note ?? ''}`.toLowerCase().includes(q))
  const byPath = new Map(cards.map((c) => [c.worktree.path, c.worktree]))

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panelRef} className="ide-board" role="dialog" aria-modal="true" aria-label="Workspace board" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
        <header className="ide-board-head">
          <h2>Workspace board</h2>
          <label className="ide-search"><Search size={12} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workspaces" aria-label="Search workspaces" /></label>
          <button className="ide-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>
        <div className="ide-board-cols">
          {COLUMNS.map((column) => {
            const items = cards.filter((c) => columnOf(c.worktree) === column.id)
            return (
              <section
                key={column.id}
                className={`ide-board-col${over === column.id ? ' ide-board-col-over' : ''}`}
                aria-label={column.label}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(column.id) } }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  const worktree = dragging ? byPath.get(dragging) : undefined
                  if (worktree && columnOf(worktree) !== column.id) move(worktree, column.id)
                  setDragging(null)
                  setOver(null)
                }}
              >
                <h3>{column.id === 'pinned' && <Pin size={12} />}{column.label}<span className="ide-count">{items.length}</span></h3>
                {items.map(({ project, worktree }) => {
                  const state = mostUrgent(worktree.sessions)
                  return (
                    <article
                      key={worktree.path}
                      className="ide-board-card"
                      draggable
                      onDragStart={(e) => { setDragging(worktree.path); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragging(null); setOver(null) }}
                    >
                      <button className="ide-board-open" onClick={() => { onOpen(worktree); onClose() }} title={worktree.path}>
                        <strong>{worktree.meta.name || worktree.branch || folderName(worktree.path)}</strong>
                        <span>{project.label}{worktree.branch ? ` - ${worktree.branch}` : ''}</span>
                        {worktree.meta.note && <p>{worktree.meta.note}</p>}
                        {state && <small className={`ide-board-state ide-board-${state}`}>{state.replace('-', ' ')}</small>}
                      </button>
                      <select aria-label={`Move ${worktree.meta.name || worktree.branch || folderName(worktree.path)}`} value={columnOf(worktree)} onChange={(e) => move(worktree, e.target.value as Column)}>
                        {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </article>
                  )
                })}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
