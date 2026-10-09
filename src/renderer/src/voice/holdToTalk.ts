/**
 * Space as a push-to-talk key without losing Space as a key: a short press
 * types a space, a press held past `holdMs` records. While Space is down and
 * another key comes, the space is typed first and that key goes through, so
 * fast typing never starts a recording (docs/voice-input.md).
 */

export interface HoldKeyEvent {
  type: string
  key: string
  repeat: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}

export interface HoldToTalkOptions {
  holdMs(): number
  enabled(): boolean
  /** Short press: type the space that was held back. */
  onTap(): void
  onStart(): void
  /** Space released while recording: transcribe. */
  onStop(): void
  /** Escape while recording, or focus lost. */
  onCancel(): void
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

type State = 'idle' | 'pressed' | 'recording' | 'cancelled'

export class HoldToTalk {
  private state: State = 'idle'
  private timer: unknown = null

  constructor(private readonly options: HoldToTalkOptions) {}

  get recording(): boolean {
    return this.state === 'recording'
  }

  /** Returns true when the event was consumed and must not reach the terminal. */
  handle(event: HoldKeyEvent): boolean {
    const isSpace = event.key === ' '
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
    switch (this.state) {
      case 'idle':
        if (event.type !== 'keydown' || !isSpace || !plain || event.repeat || event.isComposing || !this.options.enabled()) return false
        this.state = 'pressed'
        this.timer = this.options.setTimer(() => this.begin(), this.options.holdMs())
        return true
      case 'pressed':
        if (isSpace) {
          if (event.type === 'keyup') {
            this.reset()
            this.options.onTap()
          }
          return true // key repeat while deciding
        }
        if (event.type === 'keydown') {
          // Typing on: the held space comes first, then this key as usual.
          this.reset()
          this.options.onTap()
        }
        return false
      case 'recording':
        if (isSpace && event.type === 'keyup') {
          this.state = 'idle'
          this.options.onStop()
          return true
        }
        if (event.type === 'keydown' && event.key === 'Escape') {
          this.state = 'cancelled'
          this.options.onCancel()
        }
        return true // nothing else reaches the terminal while recording
      case 'cancelled':
        if (isSpace && event.type === 'keyup') this.state = 'idle'
        return isSpace || event.key === 'Escape'
    }
  }

  /** Window or terminal lost focus: no keyup will come. */
  blur(): void {
    if (this.state === 'pressed') this.reset()
    if (this.state === 'recording') {
      this.state = 'idle'
      this.options.onCancel()
    }
    if (this.state === 'cancelled') this.state = 'idle'
  }

  /** Recording stopped from outside (time limit). */
  stopFromOutside(): void {
    if (this.state === 'recording') this.state = 'cancelled'
  }

  private begin(): void {
    this.timer = null
    if (this.state !== 'pressed') return
    this.state = 'recording'
    this.options.onStart()
  }

  private reset(): void {
    if (this.timer !== null) this.options.clearTimer(this.timer)
    this.timer = null
    this.state = 'idle'
  }
}
