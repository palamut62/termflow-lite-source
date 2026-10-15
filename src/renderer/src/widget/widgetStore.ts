import { create } from 'zustand'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'

const HEADER_HEIGHT = 32
const COLLAPSED_HEIGHT = 40

interface WidgetStoreState {
  active: boolean
  collapsed: boolean
  pinned: boolean
  /**
   * The full app's size when the widget opened. The app stays mounted at this
   * size (off screen) so terminals never refit — their PTYs and agents keep
   * running exactly as they were.
   */
  frozen: { width: number; height: number } | null
  enter(): Promise<void>
  exit(focusTabId?: string): Promise<void>
  toggleCollapsed(): Promise<void>
  togglePinned(): Promise<void>
}

/** Windows controls take the widget's own surface: the theme's tab bar color (widget.css). */
function paintControls(collapsed: boolean): void {
  const style = getComputedStyle(document.documentElement)
  const hex = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim()
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  }
  window.termflow?.window?.setTitleBarOverlay({
    color: hex('--tab-background', '#252526'),
    symbolColor: hex('--tab-inactive-foreground', '#8b8b8b'),
    height: collapsed ? COLLAPSED_HEIGHT : HEADER_HEIGHT
  })
}

/** Resolves after the window has had a chance to resize and lay out again. */
function afterResize(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      window.removeEventListener('resize', onResize)
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }
    const onResize = (): void => done()
    window.addEventListener('resize', onResize)
    setTimeout(done, 400)
  })
}

export const useWidgetStore = create<WidgetStoreState>()((set, get) => ({
  active: false,
  collapsed: false,
  pinned: true,
  frozen: null,

  async enter() {
    if (get().active) return
    set({ frozen: { width: window.innerWidth, height: window.innerHeight } })
    const state = await window.termflow.window.widget('enter')
    set({ active: state.active, collapsed: state.collapsed, pinned: state.pinned })
    if (state.active) paintControls(state.collapsed)
    else set({ frozen: null })
  },

  async exit(focusTabId) {
    if (!get().active) return
    if (focusTabId) useTerminalStore.getState().setActiveTab(focusTabId)
    const state = await window.termflow.window.widget('exit')
    await afterResize()
    set({ active: state.active, collapsed: state.collapsed, pinned: state.pinned, frozen: null })
    useSettingsStore.getState().applyTheme()
  },

  async toggleCollapsed() {
    const state = await window.termflow.window.widget(get().collapsed ? 'expand' : 'collapse')
    set({ collapsed: state.collapsed })
    paintControls(state.collapsed)
  },

  async togglePinned() {
    const state = await window.termflow.window.widget(get().pinned ? 'unpin' : 'pin')
    set({ pinned: state.pinned })
  }
}))
