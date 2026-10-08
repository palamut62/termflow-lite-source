import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { OpenRouterModel } from '../../../shared/types'

export const usd = (value: number): string => `$${value < 1 ? Number(value.toPrecision(2)) : value.toFixed(2)}`

export const isFree = (model: OpenRouterModel): boolean => model.inputPrice === 0 && model.outputPrice === 0

export function contextText(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M context`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K context`
  return tokens ? `${tokens} context` : 'context unknown'
}

export function priceText(model: OpenRouterModel): string {
  if (model.inputPrice === null || model.outputPrice === null) return 'variable price'
  if (isFree(model)) return 'free'
  return `${usd(model.inputPrice)} in / ${usd(model.outputPrice)} out per 1M tokens`
}

type Filter = 'all' | 'free'

interface Props {
  models: OpenRouterModel[]
  value: string
  onChange: (id: string) => void
}

/**
 * Aranabilir model seçici. Açılınca arama boştur ve tüm modeller listelenir
 * (datalist gibi mevcut değere göre süzmez); ücretsiz modeller ayrı renkte.
 * Listede olmayan bir id de yazılıp seçilebilir.
 */
export function ModelPicker({ models, value, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const freeCount = useMemo(() => models.filter(isFree).length, [models])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter((m) => (filter === 'all' || isFree(m)) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)))
  }, [models, query, filter])
  const custom = query.trim() && !models.some((m) => m.id === query.trim()) ? query.trim() : null
  const total = shown.length + (custom ? 1 : 0)
  const selected = models.find((m) => m.id === value)

  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (id: string): void => {
    onChange(id)
    close(true)
  }

  const openPicker = (): void => {
    setQuery('')
    setFilter('all')
    const index = models.findIndex((m) => m.id === value)
    setActive(index >= 0 ? index : 0)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Etkin satırı görünür tut (açılışta seçili model, okla gezerken etkin satır).
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, shown])

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(total - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active < shown.length) choose(shown[active].id)
      else if (custom) choose(custom)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }

  const optionId = (index: number): string => `model-option-${index}`

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-input model-picker-trigger${selected && isFree(selected) ? ' model-free' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model"
        onClick={() => (open ? close(false) : openPicker())}
      >
        <span className="model-picker-value">{value || 'Choose a model'}</span>
        {selected && isFree(selected) && <span className="model-badge-free">Free</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="model-picker-pop">
          <div className="model-picker-search">
            <Search size={13} />
            <input
              ref={searchRef}
              role="combobox"
              aria-expanded
              aria-controls="model-picker-list"
              aria-activedescendant={total ? optionId(active) : undefined}
              aria-label="Search models"
              placeholder={`Search ${models.length} models or type a model id`}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onKey}
            />
          </div>
          <div className="model-picker-filters" role="group" aria-label="Filter models">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setActive(0); searchRef.current?.focus() }}>All {models.length}</button>
            <button type="button" className="model-free" aria-pressed={filter === 'free'} onClick={() => { setFilter('free'); setActive(0); searchRef.current?.focus() }}>Free {freeCount}</button>
          </div>
          <div className="model-picker-list" id="model-picker-list" role="listbox" aria-label="Models" ref={listRef}>
            {shown.map((m, index) => (
              <div
                key={m.id}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={m.id === value}
                className={`model-option${index === active ? ' model-option-active' : ''}${isFree(m) ? ' model-free' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(m.id)}
              >
                <span className="model-option-main">
                  <span className="model-option-name">{m.name}</span>
                  <span className="model-option-id">{m.id}</span>
                </span>
                <span className="model-option-meta">
                  {isFree(m) ? <span className="model-badge-free">Free</span> : <span>{priceText(m)}</span>}
                  <span>{contextText(m.contextLength)}{m.structured ? '' : ' · no JSON'}</span>
                </span>
              </div>
            ))}
            {custom && (
              <div
                id={optionId(shown.length)}
                data-index={shown.length}
                role="option"
                aria-selected={false}
                className={`model-option${active === shown.length ? ' model-option-active' : ''}`}
                onMouseEnter={() => setActive(shown.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(custom)}
              >
                <span className="model-option-main">
                  <span className="model-option-name">Use "{custom}"</span>
                  <span className="model-option-id">Not in the OpenRouter list</span>
                </span>
              </div>
            )}
            {!total && <div className="model-picker-empty">No models match.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
