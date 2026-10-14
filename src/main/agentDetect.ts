// Kurulu ajan CLI'larini bulur: yerlesik ajan profillerinden PATH'te calistirilabilir olanlar.
// Arayuz sonucu `settings.installedAgents`'a yazar; menuler buna gore kendiliginden guncellenir.

import { BUILTIN_PROFILES, profileExecutable } from '../shared/profiles'
import { executablePath } from './terminal/cli'
import { currentSearchPath, refreshPathCache } from './terminal/ShellDiscovery'

export function installedAgentIds(searchPath: string, find: (command: string, searchPath: string) => unknown = executablePath): string[] {
  return BUILTIN_PROFILES.filter((profile) => {
    try {
      find(profileExecutable(profile), searchPath)
      return true
    } catch {
      return false
    }
  }).map((profile) => profile.id)
}

export async function detectInstalledAgents(): Promise<string[]> {
  // Uygulama acikken kurulan ajan (yeni PATH girdisi) da gorulsun; yeni sekmeler de bu PATH'i alir.
  if (process.platform === 'win32') await refreshPathCache()
  return installedAgentIds(currentSearchPath())
}
