import { mergeProfiles, providerProfileId, sshProfileId } from '../../shared/profiles'
import type { AppSettings, ShellInfo } from '../../shared/types'
import type { RemoteSettingsView } from '../../shared/remote'

export interface LaunchOption {
  id: string
  name: string
  group: 'Shells' | 'Agents & profiles' | 'Providers' | 'SSH'
  color?: string
  detail?: string
}

/** Everything a new tab can be opened with, in the desktop's new-tab menu order. */
export function launchOptions(settings: RemoteSettingsView, shells: ShellInfo[]): LaunchOption[] {
  return [
    ...shells.map((s): LaunchOption => ({ id: s.id, name: s.name, group: 'Shells', detail: s.command })),
    ...mergeProfiles(settings.profiles).map((p): LaunchOption => ({ id: p.id, name: p.name, group: 'Agents & profiles', color: p.color, detail: p.startupCommand || p.command || undefined })),
    ...settings.providerProfiles.map((p): LaunchOption => ({ id: providerProfileId(p.id), name: p.name, group: 'Providers', color: p.color, detail: [p.command, p.model].filter(Boolean).join(' · ') })),
    ...(settings.sshConnections ?? []).map((c): LaunchOption => ({ id: sshProfileId(c.id), name: c.name, group: 'SSH', color: c.color, detail: `${c.user ? `${c.user}@` : ''}${c.host}${c.port ? `:${c.port}` : ''}` }))
  ]
}

export function profileName(settings: Pick<AppSettings, 'profiles' | 'providerProfiles' | 'sshConnections'> | null, shells: ShellInfo[], id: string): string {
  if (!settings) return id
  return launchOptions(settings as RemoteSettingsView, shells).find((o) => o.id === id)?.name ?? id
}

export function profileColor(settings: RemoteSettingsView | null, shells: ShellInfo[], id: string): string | undefined {
  if (!settings) return undefined
  return launchOptions(settings, shells).find((o) => o.id === id)?.color
}
