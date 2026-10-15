import { Fragment, useEffect, useMemo, useState } from 'react'
import { FileDiff, LoaderCircle, MessageSquarePlus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { pasteHandlers, useTerminalStore } from '../../../store/terminalStore'
import { useToastStore } from '../../../store/toastStore'
import { formatReviewPrompt, lineAnchor, parseUnifiedDiff, splitRows, type DiffFile, type DiffLine, type ReviewComment } from './diffModel'
import { useReviewStore } from './reviewStore'

type Layout = 'unified' | 'split'
const STATUS_LETTER: Record<DiffFile['status'], string> = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R' }

const sameAnchor = (c: ReviewComment, path: string, line: DiffLine): boolean => {
  const a = lineAnchor(line)
  return c.path === path && c.line === a.line && c.side === a.side
}

/**
 * Review (PRD F4.1-F4.2, Orca diff): worktree degisiklikleri tek sutun / yan yana, satira Markdown yorum,
 * "Send to agent" tum yorumlari tek prompt olarak secilen sekmeye yapistirir (Enter'siz).
 * Base: bos = HEAD'e karsi (commit edilmemis), dal secilirse merge-base'e karsi (Change Base Ref).
 */
export function ReviewPage({ cwd, initialFile }: { cwd: string; initialFile?: string }): React.JSX.Element {
  const [base, setBase] = useState('')
  const [refs, setRefs] = useState<string[]>([])
  const [layout, setLayout] = useState<Layout>('unified')
  const [files, setFiles] = useState<DiffFile[] | null>(null)
  const [error, setError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState(initialFile ?? '')
  const [reload, setReload] = useState(0)
  const [draft, setDraft] = useState<{ line: DiffLine; text: string } | null>(null)
  const comments = useReviewStore((s) => s.byCwd[cwd]) ?? []
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const [target, setTarget] = useState('')

  useEffect(() => { void window.termflow.git.refs(cwd).then(setRefs) }, [cwd])

  useEffect(() => {
    let stale = false
    setFiles(null)
    setError('')
    void window.termflow.git.diff(cwd, base).then((result) => {
      if (stale) return
      const parsed = parseUnifiedDiff(result.text)
      setFiles(parsed)
      setTruncated(Boolean(result.truncated))
      setError(result.error ?? '')
      setSelected((current) => (parsed.some((f) => f.path === current) ? current : parsed[0]?.path ?? ''))
    })
    return () => { stale = true }
  }, [cwd, base, reload])

  // Hedef: once bu worktree'de calisan sekmeler, sonra digerleri; varsayilan bu klasordeki aktif ya da ilk sekme.
  const targets = useMemo(() => {
    const here = (cwdOf: string): boolean => cwdOf.replace(/\\/g, '/').toLowerCase() === cwd.replace(/\\/g, '/').toLowerCase()
    return [...tabs].sort((a, b) => Number(here(b.worktree?.path || b.cwd || b.launchCwd || '')) - Number(here(a.worktree?.path || a.cwd || a.launchCwd || '')))
  }, [tabs, cwd])
  const targetId = targets.some((t) => t.id === target) ? target : (targets.find((t) => t.id === activeTabId)?.id ?? targets[0]?.id ?? '')

  const file = files?.find((f) => f.path === selected)
  const add = (line: DiffLine): void => setDraft({ line, text: '' })
  const saveDraft = (): void => {
    if (!draft || !file || !draft.text.trim()) return
    useReviewStore.getState().add(cwd, { path: file.path, ...lineAnchor(draft.line), code: draft.line.text, body: draft.text })
    setDraft(null)
  }

  const send = (): void => {
    const paste = pasteHandlers.get(targetId)
    if (!paste || comments.length === 0) return
    const prompt = formatReviewPrompt(comments, base || undefined)
    if (!paste(prompt)) {
      // Plain shell: pasting would run every line; the user can paste into the agent themselves.
      void window.termflow.clipboard.writeText(prompt)
      useToastStore.getState().show('This tab is not an agent prompt, so the comments were copied to the clipboard instead.', 'info')
      return
    }
    useReviewStore.getState().clear(cwd)
    useTerminalStore.getState().setActiveTab(targetId)
    useToastStore.getState().show(`${comments.length} review comment${comments.length === 1 ? '' : 's'} pasted. Press Enter in the tab to send.`, 'success')
  }

  const lineComments = (line: DiffLine): React.ReactNode => {
    if (!file) return null
    const here = comments.filter((c) => sameAnchor(c, file.path, line))
    const editing = draft?.line === line
    if (here.length === 0 && !editing) return null
    return (
      <div className="ide-review-thread">
        {here.map((c) => (
          <div key={c.id} className="ide-review-comment">
            <textarea aria-label="Review comment" value={c.body} onChange={(e) => useReviewStore.getState().update(cwd, c.id, e.target.value)} rows={Math.max(2, Math.min(6, c.body.split('\n').length))} />
            <button className="ide-icon-btn" onClick={() => useReviewStore.getState().remove(cwd, c.id)} title="Delete comment" aria-label="Delete comment"><Trash2 size={12} /></button>
          </div>
        ))}
        {editing && (
          <div className="ide-review-comment ide-review-draft">
            <textarea
              autoFocus
              aria-label="New review comment"
              placeholder="Comment (Markdown). Ctrl+Enter to add, Escape to cancel"
              value={draft.text}
              onChange={(e) => setDraft({ line: draft.line, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft() }
                if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) }
              }}
              rows={3}
            />
            <div className="ide-review-draft-actions">
              <button className="settings-btn" onClick={() => setDraft(null)}>Cancel</button>
              <button className="settings-btn settings-btn-primary" disabled={!draft.text.trim()} onClick={saveDraft}>Add comment</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const gutter = (line: DiffLine | undefined, no: number | undefined): React.ReactNode => (
    line
      ? <button className="ide-review-no" onClick={() => add(line)} title="Add a comment on this line" aria-label={`Comment on line ${no ?? ''}`}>{no ?? ''}<MessageSquarePlus size={11} /></button>
      : <span className="ide-review-no" />
  )

  return (
    <div className="ide-page-body ide-review">
      <div className="ide-tasks-bar">
        <label className="ide-review-base">Compare with
          <select className="settings-input" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Base ref">
            <option value="">HEAD (uncommitted changes)</option>
            {refs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
          </select>
        </label>
        <div className="ide-segment" role="radiogroup" aria-label="Diff layout">
          {(['unified', 'split'] as const).map((l) => <button key={l} role="radio" aria-checked={layout === l} className={layout === l ? 'ide-segment-on' : ''} onClick={() => setLayout(l)}>{l === 'unified' ? 'Unified' : 'Side by side'}</button>)}
        </div>
        <button className="ide-icon-btn" onClick={() => setReload((n) => n + 1)} title="Refresh" aria-label="Refresh diff"><RefreshCw size={14} /></button>
      </div>
      {error && <div className="ide-note ide-note-error" role="alert">{error}</div>}
      {truncated && <div className="ide-note">The diff is large; only part of it is shown.</div>}
      {files === null ? (
        <div className="ide-page-empty"><LoaderCircle size={20} className="spin" /></div>
      ) : files.length === 0 ? (
        <div className="ide-page-empty"><FileDiff size={28} /><strong>No changes</strong><span>{base ? `Nothing differs from ${base}.` : 'The working tree matches HEAD.'}</span></div>
      ) : (
        <div className="ide-review-main">
          <ul className="ide-review-files" role="listbox" aria-label="Changed files">
            {files.map((f) => (
              <li key={f.path} role="option" aria-selected={f.path === selected}>
                <button className={f.path === selected ? 'ide-review-file-on' : ''} onClick={() => { setSelected(f.path); setDraft(null) }} title={f.oldPath ? `${f.oldPath} -> ${f.path}` : f.path}>
                  <span className={`ide-review-status ide-review-status-${f.status}`}>{STATUS_LETTER[f.status]}</span>
                  <span className="ide-review-file-name">{f.path}</span>
                  {comments.some((c) => c.path === f.path) && <MessageSquarePlus size={11} aria-label="Has comments" />}
                  <span className="ide-review-add">+{f.additions}</span><span className="ide-review-del">-{f.deletions}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="ide-review-diff" aria-label={file ? `Diff of ${file.path}` : 'Diff'}>
            {file && (
              <>
                <div className="ide-review-diff-head">
                  <strong>{file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}</strong>
                  <button className="settings-btn" onClick={() => void window.termflow.system.openInEditor(`${cwd}/${file.path}`, 1)}>Open in editor</button>
                </div>
                {file.binary && <div className="ide-note">Binary file, no text diff.</div>}
                {!file.binary && file.hunks.length === 0 && <div className="ide-note">{file.status === 'renamed' ? 'Renamed without content changes.' : 'Empty file.'}</div>}
                {file.hunks.map((hunk, h) => (
                  <div key={h} className={`ide-review-hunk ide-review-${layout}`}>
                    <div className="ide-review-hunk-head">{hunk.header}</div>
                    {layout === 'unified'
                      ? hunk.lines.map((line, i) => (
                        <Fragment key={i}>
                          <div className={`ide-review-row ide-review-${line.kind}`}>
                            {gutter(line, line.oldNo)}
                            <span className="ide-review-no ide-review-no-new">{line.newNo ?? ''}</span>
                            <code>{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}{line.text}</code>
                          </div>
                          {lineComments(line)}
                        </Fragment>
                      ))
                      : splitRows(hunk).map((row, i) => (
                        <Fragment key={i}>
                          <div className="ide-review-row">
                            <div className={`ide-review-side ide-review-${row.left ? row.left.kind : 'empty'}`}>{gutter(row.left, row.left?.oldNo)}<code>{row.left?.text ?? ''}</code></div>
                            <div className={`ide-review-side ide-review-${row.right ? row.right.kind : 'empty'}`}>{gutter(row.right === row.left ? undefined : row.right, row.right?.newNo)}<code>{row.right?.text ?? ''}</code></div>
                          </div>
                          {row.left && lineComments(row.left)}
                          {row.right && row.right !== row.left && lineComments(row.right)}
                        </Fragment>
                      ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      <div className="ide-review-footer">
        <span>{comments.length === 0 ? 'Click a line number to comment.' : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}</span>
        {comments.length > 0 && <button className="settings-btn" onClick={() => useReviewStore.getState().clear(cwd)}><X size={13} /> Clear</button>}
        <select className="settings-input" value={targetId} onChange={(e) => setTarget(e.target.value)} aria-label="Send to tab" disabled={targets.length === 0}>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <button className="settings-btn settings-btn-primary" disabled={comments.length === 0 || !pasteHandlers.has(targetId)} onClick={send} title="Paste all comments into the tab as one prompt (Enter is not pressed)">
          <Send size={13} /> Send to agent
        </button>
      </div>
    </div>
  )
}
