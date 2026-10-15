import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import type { IdeProject } from './ideTreeModel'
import { saveIde } from './ProjectTree'

/**
 * "Show hidden worktrees" (Orca "Non-Orca worktrees"): baska araclarin actigi worktree'ler varsayilan gizli.
 * Kaynak basina (Claude Code, diger konumlar) ya da tek tek gosterilir. Ayar tum projeler icin gecerli.
 */
export function HiddenWorktreesDialog({ project, onClose }: { project: IdeProject; onClose: () => void }): React.JSX.Element {
  const ide = useSettingsStore((s) => s.settings.ide)
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { panelRef.current?.focus() }, [])

  const all = [...project.worktrees, ...project.hidden].filter((w) => !w.primary)
  const count = (source: 'claude' | 'other'): number => all.filter((w) => w.source === source).length
  const hidden = project.hidden.filter((w) => `${w.branch ?? ''} ${w.path}`.toLowerCase().includes(query.trim().toLowerCase()))

  const sources = [
    { key: 'showClaudeWorktrees' as const, label: 'Claude Code', pattern: '.claude/worktrees/*', found: count('claude') },
    { key: 'showOtherWorktrees' as const, label: 'Other locations', pattern: 'Outside listed sources', found: count('other') }
  ]

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={panelRef}
        className="ide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hidden-worktrees-title"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      >
        <header className="ide-dialog-head">
          <div>
            <h2 id="hidden-worktrees-title">Other tools&apos; worktrees</h2>
            <span>{project.label}</span>
          </div>
          <button className="ide-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>
        <section>
          <h3>Sources</h3>
          <p className="ide-dialog-note">Worktrees TermFlow created and ones with an open terminal always show.</p>
          <div className="ide-dialog-list">
            {sources.map((source) => (
              <div key={source.key} className="ide-dialog-row">
                <div>
                  <strong>{source.label}</strong> <span className="ide-dialog-note">{source.found} found</span>
                  <code>{source.pattern}</code>
                </div>
                <div className="ide-segment ide-segment-small" role="radiogroup" aria-label={`${source.label} worktrees`}>
                  <button role="radio" aria-checked={ide[source.key]} className={ide[source.key] ? 'ide-segment-on' : ''} onClick={() => saveIde({ [source.key]: true })}>Show</button>
                  <button role="radio" aria-checked={!ide[source.key]} className={!ide[source.key] ? 'ide-segment-on' : ''} onClick={() => saveIde({ [source.key]: false })}>Hide</button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="ide-dialog-subhead">
            <h3>Hidden worktrees ({project.hidden.length})</h3>
            <label className="ide-search ide-search-small"><Search size={12} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${project.hidden.length} worktrees`} aria-label="Search hidden worktrees" /></label>
          </div>
          <div className="ide-dialog-list ide-dialog-scroll">
            {hidden.length === 0 && <div className="ide-dialog-note ide-dialog-empty">{project.hidden.length ? 'No matches.' : 'Nothing is hidden in this project.'}</div>}
            {hidden.map((worktree) => (
              <div key={worktree.path} className="ide-dialog-row">
                <div>
                  <strong>{worktree.branch ?? 'detached HEAD'}</strong>
                  <code title={worktree.path}>{worktree.path}</code>
                </div>
                <button className="settings-btn settings-btn-small" onClick={() => saveIde({ shownWorktrees: [...ide.shownWorktrees, worktree.path] })}>Show</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
