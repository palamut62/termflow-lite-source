import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { pathLabel } from '../../../sessionRail'

const SAVE_DELAY_MS = 600

/**
 * Worktree notu (PRD F4.3): worktree basina tek Markdown dosyasi, userData/notes altinda (projeye yazilmaz,
 * git status'ta gorunmez). Yazdikca kisa beklemeyle kaydedilir; sayfa kapanirken bekleyen yazim da kaydedilir.
 */
export function NotesPage({ cwd }: { cwd: string }): React.JSX.Element {
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved')
  const pending = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let stale = false
    setText(null)
    void window.termflow.notes.read(cwd).then((value) => { if (!stale) setText(value) })
    return () => { stale = true }
  }, [cwd])

  const flush = (): void => {
    window.clearTimeout(timer.current)
    const value = pending.current
    if (value === null) return
    pending.current = null
    setState('saving')
    void window.termflow.notes.write(cwd, value).then((ok) => setState(ok ? 'saved' : 'error'), () => setState('error'))
  }
  // Sayfa kapanirken ya da worktree degisirken yazilmamis metin kaybolmasin.
  useEffect(() => flush, [cwd])

  const onChange = (value: string): void => {
    setText(value)
    pending.current = value
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  return (
    <div className="ide-page-body ide-notes">
      <div className="ide-notes-head">
        <strong title={cwd}>{pathLabel(cwd)}</strong>
        <span className={`ide-notes-state${state === 'error' ? ' ide-notes-error' : ''}`} role="status">
          {state === 'saving' ? 'Saving...' : state === 'error' ? 'Could not save the note' : 'Saved'}
        </span>
      </div>
      {text === null
        ? <div className="ide-page-empty"><LoaderCircle size={20} className="spin" /></div>
        : (
          <textarea
            className="ide-notes-editor"
            aria-label="Worktree notes (Markdown)"
            placeholder={'# Notes\n\nPlans, TODOs and findings for this worktree. Stored with TermFlow, not in the project.'}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
            spellCheck={false}
          />
        )}
    </div>
  )
}
