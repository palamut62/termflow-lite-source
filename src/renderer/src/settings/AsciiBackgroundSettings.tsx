import { useState } from 'react'
import { ASCII_DENSITY, ASCII_OPACITY, DEFAULT_ASCII_BACKGROUND } from '../../../shared/asciiBackground'
import { mergeProfiles, providerProfileId, sshProfileId } from '../../../shared/profiles'
import type { AsciiBackground, AsciiCharset } from '../../../shared/types'
import { isLightColor } from '../backdrop'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { AsciiBackdrop } from '../terminal/AsciiBackdrop'
import { resolveTheme } from '../themes/themes'
import { Field, Select } from './Settings'

/**
 * A picture per profile, drawn as ASCII behind the terminal text. The main
 * process shrinks the file to a small JPEG; settings store only that.
 */
export function AsciiBackgroundSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const shells = useSettingsStore((s) => s.shells)
  const [profileId, setProfileId] = useState(settings.defaultProfileId)
  const [busy, setBusy] = useState(false)

  const profiles = [
    ...shells.map((s) => ({ value: s.id, label: s.name })),
    ...mergeProfiles(settings.profiles).map((p) => ({ value: p.id, label: p.name })),
    ...settings.providerProfiles.map((p) => ({ value: providerProfileId(p.id), label: p.name })),
    ...settings.sshConnections.map((c) => ({ value: sshProfileId(c.id), label: `SSH: ${c.name}` }))
  ]
  // A picture left on a profile that no longer exists stays reachable, so it can be removed.
  for (const id of new Set([profileId, ...Object.keys(settings.asciiBackgrounds)])) {
    if (!profiles.some((p) => p.value === id)) profiles.push({ value: id, label: `${id} (not found)` })
  }
  const current = settings.asciiBackgrounds[profileId]
  const label = profiles.find((p) => p.value === profileId)?.label ?? profileId
  const theme = resolveTheme(settings).colors

  const save = (next: AsciiBackground | null): Promise<void> => {
    const all = { ...settings.asciiBackgrounds }
    if (next) all[profileId] = next
    else delete all[profileId]
    return update({ asciiBackgrounds: all })
  }
  const patch = (change: Partial<AsciiBackground>): void => {
    if (current) void save({ ...current, ...change })
  }
  const pick = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.termflow.dialog.pickBackground()
      if (result.status === 'invalid') useToastStore.getState().show(result.reason, 'error')
      if (result.status !== 'ok') return
      await save({ ...DEFAULT_ASCII_BACKGROUND, ...current, image: result.image })
      useToastStore.getState().show(`ASCII background set for ${label}.`, 'success')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="settings-section-title">ASCII Background</div>
      <Field label="Profile" hint="each profile can have its own picture; new tabs of that profile show it">
        <Select value={profileId} options={profiles} onChange={setProfileId} />
      </Field>
      <Field label="Picture" hint="PNG, JPG, WEBP, BMP or GIF. A small copy is kept in your settings; the file itself is not used again.">
        <button className="settings-btn" disabled={busy} onClick={() => void pick()}>
          {busy ? 'Opening...' : current ? 'Change picture' : 'Choose picture'}
        </button>
        {current && (
          <button className="settings-btn settings-btn-danger" disabled={busy} onClick={() => void save(null)}>
            Remove
          </button>
        )}
      </Field>
      {current && (
        <>
          <div className="ascii-bg-preview" style={{ background: theme.background }} aria-label={`Preview of the ASCII background for ${label}`} role="img">
            <AsciiBackdrop background={current} color={theme.foreground} invert={isLightColor(theme.background)} fontFamily={settings.fontFamily} />
            <span className="ascii-bg-preview-text" style={{ color: theme.foreground, fontFamily: settings.fontFamily }}>
              PS C:\dev&gt; npm test
            </span>
          </div>
          <Field label="Characters">
            <Select
              value={current.charset}
              options={[
                { value: 'dots', label: 'Dots  . · : •' },
                { value: 'ascii', label: 'ASCII  . : - = + * # @' },
                { value: 'blocks', label: 'Blocks  ░ ▒ ▓ █' }
              ]}
              onChange={(v) => patch({ charset: v as AsciiCharset })}
            />
          </Field>
          <Field label="Density" hint={`${current.density}px per character; smaller draws a finer picture`}>
            <input
              type="range"
              className="settings-range"
              min={ASCII_DENSITY.min}
              max={ASCII_DENSITY.max}
              step={1}
              value={current.density}
              onChange={(e) => patch({ density: Number(e.target.value) })}
              aria-label="ASCII background density"
            />
          </Field>
          <Field label="Opacity" hint={`${current.opacity}%; keep it low so your text stays easy to read`}>
            <input
              type="range"
              className="settings-range"
              min={ASCII_OPACITY.min}
              max={ASCII_OPACITY.max}
              step={1}
              value={current.opacity}
              onChange={(e) => patch({ opacity: Number(e.target.value) })}
              aria-label="ASCII background opacity"
            />
          </Field>
        </>
      )}
    </section>
  )
}
