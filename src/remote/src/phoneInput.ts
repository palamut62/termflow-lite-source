/**
 * Live keyboard input for phones. xterm's own hidden textarea misbehaves with
 * mobile keyboards (word suggestions, autocorrect, Backspace on an empty
 * field), so the phone types into its own field and every change is turned
 * into terminal keystrokes by comparing the field before and after.
 */

/** Kept in the field so Backspace still fires when nothing was typed yet. */
export const SENTINEL = '  '
/** Past this length the field is reset (when no word is being composed). */
const MAX_FIELD = 200

/** Keystrokes that turn `prev` into `next`: DEL for each removed char, then the added text. */
export function diffInput(prev: string, next: string): string {
  let same = 0
  const max = Math.min(prev.length, next.length)
  while (same < max && prev.charCodeAt(same) === next.charCodeAt(same)) same++
  const removed = prev.length - same
  return '\x7f'.repeat(removed) + next.slice(same).replace(/\r?\n/g, '\r')
}

/** Hardware / special keys that do not produce text in the field. */
export function keySequence(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, applicationCursor: boolean): string | null {
  const arrow = (code: string): string => (applicationCursor ? `\x1bO${code}` : `\x1b[${code}`)
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
    const code = event.key.toUpperCase().charCodeAt(0)
    if (code >= 64 && code <= 95) return String.fromCharCode(code - 64)
    if (event.key === ' ') return '\x00'
  }
  switch (event.key) {
    case 'Enter': return '\r'
    case 'Tab': return event.shiftKey ? '\x1b[Z' : '\t'
    case 'Escape': return '\x1b'
    case 'ArrowUp': return arrow('A')
    case 'ArrowDown': return arrow('B')
    case 'ArrowRight': return arrow('C')
    case 'ArrowLeft': return arrow('D')
    case 'Home': return '\x1b[H'
    case 'End': return '\x1b[F'
    case 'PageUp': return '\x1b[5~'
    case 'PageDown': return '\x1b[6~'
    case 'Delete': return '\x1b[3~'
    default: return null
  }
}

export interface PhoneInputOptions {
  /** Text typed by the user (already mapped to terminal keystrokes). */
  onText(data: string): void
  /** Special keys; sent as is. */
  onKey(data: string): void
  applicationCursor(): boolean
}

/** Wires a textarea as the phone's live keyboard; returns a cleanup function. */
export function attachPhoneInput(field: HTMLTextAreaElement, options: PhoneInputOptions): () => void {
  let last = SENTINEL
  let composing = false

  const reset = (): void => {
    field.value = SENTINEL
    last = SENTINEL
    field.setSelectionRange(SENTINEL.length, SENTINEL.length)
  }

  const flush = (): void => {
    const next = field.value
    if (next === last) return
    const data = diffInput(last, next)
    last = next
    if (data) options.onText(data)
    if (!composing && (next.length < SENTINEL.length || next.length > MAX_FIELD || !next.startsWith(SENTINEL))) reset()
  }

  const onInput = (): void => flush()
  const onCompositionStart = (): void => { composing = true }
  const onCompositionEnd = (): void => {
    composing = false
    flush()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    // Mobile keyboards report most keys as 229 / "Unidentified"; those arrive as input instead.
    if (event.isComposing || event.key === 'Unidentified' || event.key === 'Process') return
    if (event.key === 'Backspace' || (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey)) return
    const data = keySequence(event, options.applicationCursor())
    if (data === null) return
    event.preventDefault()
    flush()
    options.onKey(data)
    if (data === '\r') reset()
  }
  const onFocus = (): void => {
    if (!field.value.startsWith(SENTINEL)) reset()
    else field.setSelectionRange(field.value.length, field.value.length)
  }

  reset()
  field.addEventListener('input', onInput)
  field.addEventListener('compositionstart', onCompositionStart)
  field.addEventListener('compositionend', onCompositionEnd)
  field.addEventListener('keydown', onKeyDown)
  field.addEventListener('focus', onFocus)
  return () => {
    field.removeEventListener('input', onInput)
    field.removeEventListener('compositionstart', onCompositionStart)
    field.removeEventListener('compositionend', onCompositionEnd)
    field.removeEventListener('keydown', onKeyDown)
    field.removeEventListener('focus', onFocus)
  }
}
