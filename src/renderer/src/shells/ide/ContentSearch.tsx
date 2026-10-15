import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import type { FileSearchQuery, FileSearchResult } from '../../../../shared/ipc'

/** Explorer "Contents" (PRD 4.9): klasorde tam metin arama; sonuc dosyaya gore gruplu, satira tiklamak VS Code'da acar. */
export function ContentSearch({ cwd }: { cwd: string }): React.JSX.Element {
  const [query, setQuery] = useState<FileSearchQuery>({ text: '' })
  const [result, setResult] = useState<FileSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const set = (patch: Partial<FileSearchQuery>): void => setQuery((q) => ({ ...q, ...patch }))

  // Yazarken her tusa git grep calistirmamak icin kisa bekleme.
  useEffect(() => {
    if (!cwd || !query.text) { setResult(null); return }
    let stale = false
    const timer = window.setTimeout(() => {
      setBusy(true)
      void window.termflow.files.search(cwd, query).then((r) => { if (!stale) { setResult(r); setCollapsed(new Set()) } }).finally(() => { if (!stale) setBusy(false) })
    }, 250)
    return () => { stale = true; window.clearTimeout(timer) }
  }, [cwd, query])

  const toggle = (key: 'caseSensitive' | 'word' | 'regex', label: string, title: string): React.JSX.Element => (
    <button className={`ide-search-opt${query[key] ? ' ide-search-opt-on' : ''}`} onClick={() => set({ [key]: !query[key] })} title={title} aria-label={title} aria-pressed={Boolean(query[key])}>{label}</button>
  )
  const total = result?.files.reduce((n, f) => n + f.matches.length, 0) ?? 0

  return (
    <div className="ide-content-search">
      <div className="ide-search ide-search-row">
        <input value={query.text} onChange={(e) => set({ text: e.target.value })} placeholder="Search in files" aria-label="Search in files" spellCheck={false} autoFocus />
        {toggle('caseSensitive', 'Aa', 'Match case')}
        {toggle('word', 'ab', 'Match whole word')}
        {toggle('regex', '.*', 'Use regular expression')}
      </div>
      <input className="ide-search ide-search-glob" value={query.include ?? ''} onChange={(e) => set({ include: e.target.value })} placeholder="Files to include (e.g. *.ts, src/**)" aria-label="Files to include" spellCheck={false} />
      <input className="ide-search ide-search-glob" value={query.exclude ?? ''} onChange={(e) => set({ exclude: e.target.value })} placeholder="Files to exclude" aria-label="Files to exclude" spellCheck={false} />
      {busy && <div className="ide-note"><LoaderCircle size={14} className="spin" /> Searching...</div>}
      {!busy && result?.error && <div className="ide-note ide-note-error">{result.error}</div>}
      {!busy && result && !result.error && (
        <div className="ide-note">{total === 0 ? 'No results.' : `${total} result${total === 1 ? '' : 's'} in ${result.files.length} file${result.files.length === 1 ? '' : 's'}${result.truncated ? ' (first 2000 shown)' : ''}`}</div>
      )}
      <ul className="ide-search-results" aria-label="Search results">
        {result?.files.map((file) => {
          const open = !collapsed.has(file.path)
          return (
            <li key={file.path}>
              <button className="ide-search-file" aria-expanded={open} onClick={() => setCollapsed((c) => { const n = new Set(c); if (open) n.add(file.path); else n.delete(file.path); return n })} title={file.path}>
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>{file.path}</span>
                <span className="ide-count">{file.matches.length}</span>
              </button>
              {open && (
                <ul>
                  {file.matches.map((m) => (
                    <li key={m.line}>
                      <button className="ide-search-line" onClick={() => void window.termflow.system.openInEditor(file.absolute, m.line)} title={`Line ${m.line}`}>
                        <small>{m.line}</small><span>{m.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
