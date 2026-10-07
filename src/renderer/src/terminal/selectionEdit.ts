import type { Terminal } from '@xterm/xterm'

/** Buffer'dan hücre okuyan küçük soyutlama; birim testte sahte ızgara verilir. */
export interface CellGrid {
  cols: number
  /** Hücre genişliği: 1 normal, 2 geniş karakter başı, 0 geniş karakterin devamı. */
  width(row: number, col: number): number
  /** Hücrede karakter var mı (satır sonundaki boş hücreler false). */
  filled(row: number, col: number): boolean
  /** Satır bir önceki satırın yumuşak sarmalı (soft wrap) devamı mı. */
  isWrapped(row: number): boolean
}

/** 0 tabanlı sütun, mutlak buffer satırı; seçim sonu dışlayıcıdır. */
export interface CellPos {
  x: number
  y: number
}

export interface SelectionEditPlan {
  /** İmleci seçim sonuna götürmek için ok sayısı; negatif sola, pozitif sağa. */
  moves: number
  /** Seçimi silmek için backspace sayısı. */
  deletes: number
}

/**
 * Seçili metnin yerine yazmak için imlecin kaç karakter oynatılacağını ve kaç
 * karakter silineceğini hesaplar. Seçim imleçle aynı mantıksal satırda (aynı
 * satır ya da yumuşak sarmal devamı) ve yazılmış metnin içinde değilse null:
 * o zaman terminal eski davranışına (imleçte yaz) devam eder.
 */
export function planSelectionEdit(
  grid: CellGrid,
  start: CellPos,
  end: CellPos,
  cursor: CellPos
): SelectionEditPlan | null {
  const firstRow = Math.min(start.y, end.y, cursor.y)
  const lastRow = Math.max(start.y, end.y, cursor.y)
  for (let row = firstRow + 1; row <= lastRow; row++) {
    if (!grid.isWrapped(row)) return null
  }
  const linear = (p: CellPos): number => (p.y - firstRow) * grid.cols + p.x
  const cell = (index: number): CellPos => ({ x: index % grid.cols, y: firstRow + Math.floor(index / grid.cols) })
  const a = linear(start)
  const b = linear(end)
  const c = linear(cursor)
  if (b <= a) return null

  // Seçim yazılmış metnin dışına taşamaz; aksi halde oklar satır sonunda
  // takılır ve backspace yanlış karakterleri siler.
  let textEnd = c
  for (let i = (lastRow - firstRow + 1) * grid.cols - 1; i >= 0; i--) {
    const p = cell(i)
    if (grid.filled(p.y, p.x)) {
      textEnd = Math.max(textEnd, i + 1)
      break
    }
  }
  if (b > textEnd) return null

  // Ok tuşları hücre değil karakter başına ilerler: geniş karakterin devam
  // hücresi (genişlik 0) sayılmaz.
  const chars = (from: number, to: number): number => {
    let count = 0
    for (let i = from; i < to; i++) {
      const p = cell(i)
      if (grid.width(p.y, p.x) > 0) count++
    }
    return count
  }
  const deletes = chars(a, b)
  if (deletes === 0) return null
  const moves = b >= c ? chars(c, b) : -chars(b, c)
  return { moves, deletes }
}

/**
 * Tuş seçimin yerine metin üretecek mi? Kısayollar (Ctrl/Alt/Meta) hariç;
 * AltGr (Windows'ta Ctrl+Alt olarak gelir) karakter ürettiği için dahil.
 * IME ve ölü tuşlar ('Process', 'Dead') eski davranışta kalır.
 */
function producesText(e: KeyboardEvent): boolean {
  if ([...e.key].length !== 1 || e.metaKey) return false
  if (e.ctrlKey || e.altKey) return e.getModifierState('AltGraph')
  return true
}

/**
 * Çift tıkla seçilen kelimenin üzerine yazma: seçim imlecin satırındaysa,
 * yazılan karakterden önce imleç oklarla seçim sonuna götürülür ve seçim
 * backspace ile silinir. Backspace/Delete yalnızca seçimi siler. Shell ve
 * imleci gerçek caret'e koyan TUI ajanlar (Claude Code, Codex) ile çalışır.
 * true dönerse tuş tüketilmiştir (xterm'e iletilmez).
 */
export function handleSelectionEditKey(term: Terminal, e: KeyboardEvent): boolean {
  if (!term.hasSelection()) return false
  const isDelete = (e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
  if (!isDelete && !producesText(e)) return false
  const range = term.getSelectionPosition()
  if (!range) return false
  const buffer = term.buffer.active
  const grid: CellGrid = {
    cols: term.cols,
    width: (row, col) => buffer.getLine(row)?.getCell(col)?.getWidth() ?? 1,
    filled: (row, col) => (buffer.getLine(row)?.getCell(col)?.getChars() ?? '') !== '',
    isWrapped: (row) => buffer.getLine(row)?.isWrapped ?? false
  }
  const cursor = { x: buffer.cursorX, y: buffer.baseY + buffer.cursorY }
  const plan = planSelectionEdit(grid, range.start, range.end, cursor)
  if (!plan) return false
  const app = term.modes.applicationCursorKeysMode
  const arrow = plan.moves >= 0 ? (app ? '\x1bOC' : '\x1b[C') : app ? '\x1bOD' : '\x1b[D'
  term.clearSelection()
  term.input(arrow.repeat(Math.abs(plan.moves)) + '\x7f'.repeat(plan.deletes), true)
  // Silme tuşu işini yaptı; karakter tuşu xterm'e gider ve boşalan yere yazılır.
  return isDelete
}
