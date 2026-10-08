import type { IDisposable, Terminal } from '@xterm/xterm'

/** Buffer'dan hücre okuyan küçük soyutlama; birim testte sahte ızgara verilir. */
export interface CellGrid {
  cols: number
  /** Hücre genişliği: 1 normal, 2 geniş karakter başı, 0 geniş karakterin devamı. */
  width(row: number, col: number): number
  /** Hücredeki karakter ('' ya da ' ' boş sayılır). */
  chars(row: number, col: number): string
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

/** Mantıksal satır (yumuşak sarmallarla birleşen satırlar) aranırken üst sınır. */
const MAX_WRAP_ROWS = 50

/**
 * Seçili metnin yerine yazmak için imlecin kaç karakter oynatılacağını ve kaç
 * karakter silineceğini hesaplar. Seçim, imlecin mantıksal satırına (aynı satır
 * ya da yumuşak sarmal devamı) kırpılır: üç tık, satır sonuna taşan sürükleme
 * ya da Select All ile tüm input seçilip silinebilir. Seçim o satıra hiç
 * değmiyorsa null: terminal eski davranışına (imleçte yaz) devam eder.
 */
export function planSelectionEdit(
  grid: CellGrid,
  start: CellPos,
  end: CellPos,
  caret: CellPos
): SelectionEditPlan | null {
  let firstRow = caret.y
  while (firstRow > 0 && caret.y - firstRow < MAX_WRAP_ROWS && grid.isWrapped(firstRow)) firstRow--
  let lastRow = caret.y
  while (lastRow - caret.y < MAX_WRAP_ROWS && grid.isWrapped(lastRow + 1)) lastRow++
  if (end.y < firstRow || start.y > lastRow) return null

  const cells = (lastRow - firstRow + 1) * grid.cols
  const linear = (p: CellPos): number => (p.y - firstRow) * grid.cols + p.x
  const cell = (index: number): CellPos => ({ x: index % grid.cols, y: firstRow + Math.floor(index / grid.cols) })
  const c = linear(caret)

  // Yazılmış metnin sonu: son boş olmayan hücre (imleç sondaki boşlukların
  // ötesindeyse imleç). Seçim bunun ötesine kırpılır; aksi halde oklar satır
  // sonunda takılır ve fazladan backspace yanlış karakterleri siler.
  let textEnd = c
  for (let i = cells - 1; i >= c; i--) {
    const p = cell(i)
    const ch = grid.chars(p.y, p.x)
    if (ch !== '' && ch !== ' ') {
      textEnd = i + 1
      break
    }
  }
  const a = Math.max(0, start.y < firstRow ? 0 : linear(start))
  const b = Math.min(textEnd, end.y > lastRow ? cells : linear(end))
  if (b <= a) return null

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
 * Çift tıkla seçilen kelimenin (ya da tüm inputun) üzerine yazma: yazılan
 * karakterden önce imleç oklarla seçim sonuna götürülür ve seçim backspace ile
 * silinir; Backspace/Delete yalnızca seçimi siler.
 *
 * İmleç: gerçek terminal imleci görünürse o (shell, Codex). Claude Code gibi
 * TUI'ler gerçek imleci gizleyip başka satıra park eder ve caret'i ters renkli
 * (inverse) bir hücre olarak çizer; imleç gizliyken seçimin satırlarındaki tek
 * inverse hücre caret sayılır.
 */
export class SelectionEdit implements IDisposable {
  private cursorHidden = false
  private readonly subs: IDisposable[]

  constructor(private readonly term: Terminal) {
    // DECTCEM (?25h / ?25l) takibi; false dönerek xterm'in kendi işleyicisi de çalışır.
    const track = (hidden: boolean) => (params: (number | number[])[]): boolean => {
      if (params.includes(25)) this.cursorHidden = hidden
      return false
    }
    this.subs = [
      term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, track(false)),
      term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, track(true))
    ]
  }

  /** true dönerse tuş tüketilmiştir (xterm'e iletilmez). */
  handleKey(e: KeyboardEvent): boolean {
    const term = this.term
    if (!term.hasSelection()) return false
    const isDelete =
      (e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
    if (!isDelete && !producesText(e)) return false
    const range = term.getSelectionPosition()
    if (!range) return false
    const buffer = term.buffer.active
    const grid: CellGrid = {
      cols: term.cols,
      width: (row, col) => buffer.getLine(row)?.getCell(col)?.getWidth() ?? 1,
      chars: (row, col) => buffer.getLine(row)?.getCell(col)?.getChars() ?? '',
      isWrapped: (row) => buffer.getLine(row)?.isWrapped ?? false
    }
    const caret = this.cursorHidden
      ? this.drawnCaret(range.start.y, range.end.y)
      : { x: buffer.cursorX, y: buffer.baseY + buffer.cursorY }
    if (!caret) return false
    const plan = planSelectionEdit(grid, range.start, range.end, caret)
    if (!plan) return false
    const app = term.modes.applicationCursorKeysMode
    const arrow = plan.moves >= 0 ? (app ? '\x1bOC' : '\x1b[C') : app ? '\x1bOD' : '\x1b[D'
    term.clearSelection()
    term.input(arrow.repeat(Math.abs(plan.moves)) + '\x7f'.repeat(plan.deletes), true)
    // Silme tuşu işini yaptı; karakter tuşu xterm'e gider ve boşalan yere yazılır.
    return isDelete
  }

  /** Seçimin ekrandaki satırlarında tam bir inverse hücre varsa onun konumu. */
  private drawnCaret(fromRow: number, toRow: number): CellPos | null {
    const buffer = this.term.buffer.active
    const top = Math.max(fromRow, buffer.viewportY)
    const bottom = Math.min(toRow, buffer.viewportY + this.term.rows - 1)
    let found: CellPos | null = null
    for (let y = top; y <= bottom; y++) {
      const line = buffer.getLine(y)
      if (!line) continue
      for (let x = 0; x < this.term.cols; x++) {
        if (!line.getCell(x)?.isInverse()) continue
        if (found) return null
        found = { x, y }
      }
    }
    return found
  }

  dispose(): void {
    for (const sub of this.subs) sub.dispose()
  }
}
