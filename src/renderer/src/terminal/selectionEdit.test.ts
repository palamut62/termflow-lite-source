import { describe, expect, it } from 'vitest'
import { planSelectionEdit, type CellGrid } from './selectionEdit'

/** Satırları düz metin olarak alan sahte ızgara; '~' geniş karakter devam hücresi. */
function grid(rows: string[], cols: number, wrapped: number[] = []): CellGrid {
  return {
    cols,
    width: (row, col) => (rows[row]?.[col] === '~' ? 0 : 1),
    filled: (row, col) => col < (rows[row]?.length ?? 0),
    isWrapped: (row) => wrapped.includes(row)
  }
}

describe('planSelectionEdit', () => {
  // "PS> git commit -m fix" ; imleç satır sonunda (x=21)
  const line = grid(['PS> git commit -m fix'], 80)

  it('moves left to the selection end and deletes the word', () => {
    // "commit" = x 8..14
    expect(planSelectionEdit(line, { x: 8, y: 0 }, { x: 14, y: 0 }, { x: 21, y: 0 })).toEqual({ moves: -7, deletes: 6 })
  })

  it('moves right when the cursor is before the selection', () => {
    expect(planSelectionEdit(line, { x: 8, y: 0 }, { x: 14, y: 0 }, { x: 4, y: 0 })).toEqual({ moves: 10, deletes: 6 })
  })

  it('needs no move when the cursor already sits at the selection end', () => {
    expect(planSelectionEdit(line, { x: 18, y: 0 }, { x: 21, y: 0 }, { x: 21, y: 0 })).toEqual({ moves: 0, deletes: 3 })
  })

  it('ignores selections on another, unwrapped line', () => {
    const g = grid(['old output', 'PS> echo hi'], 80)
    expect(planSelectionEdit(g, { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 11, y: 1 })).toBeNull()
  })

  it('follows soft-wrapped continuation rows', () => {
    const g = grid(['PS> echo aaaa', 'bbbb cc'], 13, [1])
    // "bbbb" satır 1, x 0..4; imleç satır 1 sonunda (x=7)
    expect(planSelectionEdit(g, { x: 0, y: 1 }, { x: 4, y: 1 }, { x: 7, y: 1 })).toEqual({ moves: -3, deletes: 4 })
    // satır 0'daki "echo", imleç satır 1'de
    expect(planSelectionEdit(g, { x: 4, y: 0 }, { x: 8, y: 0 }, { x: 7, y: 1 })).toEqual({ moves: -12, deletes: 4 })
  })

  it('counts wide characters once', () => {
    const g = grid(['> 日~本~ ok'], 80)
    expect(planSelectionEdit(g, { x: 2, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 })).toEqual({ moves: -3, deletes: 2 })
  })

  it('refuses selections that reach past the typed text', () => {
    expect(planSelectionEdit(line, { x: 18, y: 0 }, { x: 30, y: 0 }, { x: 21, y: 0 })).toBeNull()
  })

  it('refuses empty selections', () => {
    expect(planSelectionEdit(line, { x: 8, y: 0 }, { x: 8, y: 0 }, { x: 21, y: 0 })).toBeNull()
  })
})
