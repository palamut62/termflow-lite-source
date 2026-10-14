import { useEffect, useRef } from 'react'
import { PanelsTopLeft, SquareTerminal } from 'lucide-react'
import { EDITION } from '../../../shared/edition'
import type { IdeRightTab } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'

/** Agent IDE <-> Terminal yerlesimi (yalniz IDE surumu). Terminaller ve ajanlar calismaya devam eder. */
export function toggleUiMode(): void {
  if (EDITION !== 'ide') return
  const { settings, update } = useSettingsStore.getState()
  void update({ uiMode: settings.uiMode === 'ide' ? 'terminal' : 'ide', uiModeChosen: true })
}

/** Sag paneli istenen sekmede ac; zaten o sekmede aciksa kapat. */
export function toggleRightPanel(tab: IdeRightTab): void {
  const { settings, update } = useSettingsStore.getState()
  const ide = settings.ide
  const close = ide.rightOpen && ide.rightTab === tab
  void update({ ide: { ...ide, rightOpen: !close, rightTab: tab } })
}

/**
 * Ilk acilis karti (PRD F0.4): yalniz IDE surumunde ve henuz secim yapilmamissa.
 * Escape ya da disari tiklama Agent IDE'yi (varsayilan) secer; kart bir daha cikmaz.
 */
export function LayoutChoice(): React.JSX.Element | null {
  const chosen = useSettingsStore((s) => s.settings.uiModeChosen)
  const panelRef = useRef<HTMLDivElement>(null)
  const show = EDITION === 'ide' && !chosen
  useEffect(() => { if (show) panelRef.current?.querySelector('button')?.focus() }, [show])
  if (!show) return null
  const choose = (uiMode: 'terminal' | 'ide'): void => { void useSettingsStore.getState().update({ uiMode, uiModeChosen: true }) }
  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) choose('ide') }}>
      <div
        ref={panelRef}
        className="layout-choice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-choice-title"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); choose('ide') } }}
      >
        <h2 id="layout-choice-title">How do you want to work?</h2>
        <p>You can switch any time with Ctrl+Shift+I. Running terminals and agents keep going.</p>
        <div className="layout-choice-options">
          <button className="layout-choice-option" onClick={() => choose('ide')}>
            <PanelsTopLeft size={28} />
            <strong>Agent IDE</strong>
            <span>Projects, worktrees and agents on the left, terminals in the middle, files and git on the right.</span>
          </button>
          <button className="layout-choice-option" onClick={() => choose('terminal')}>
            <SquareTerminal size={28} />
            <strong>Terminal</strong>
            <span>A plain, fast tabbed terminal. Everything else stays one shortcut away.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
