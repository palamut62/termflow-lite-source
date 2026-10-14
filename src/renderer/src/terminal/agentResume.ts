import type { AgentKind, AgentSession, AgentSessionRef, AppSettings, TerminalTab } from '../../../shared/types'
import { agentForProfile } from '../../../shared/profiles'

/**
 * agent-resume (docs/orca-parity/agent-resume.md): yeniden acilista ajan sekmesi kendi
 * konusmasiyla surer. Kimlik Claude'da hook'tan, Codex'te ilk turdan sonra yerel oturum
 * dosyalarindan gelir; yalniz { agent, id } kaydedilir.
 */

const samePath = (a: string, b: string): boolean =>
  a.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() === b.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()

/** Sekmenin baslattigi oturum: ayni klasor, sekmeden sonra (10 sn tolerans) baslamis, baska sekmeye ait degil; en yenisi. */
export function pickStartedSession(sessions: readonly AgentSession[], cwd: string, startedAt: number, taken: ReadonlySet<string>): string | null {
  const match = sessions
    .filter((s) => s.cwd && samePath(s.cwd, cwd) && (s.createdAt ?? 0) >= startedAt - 10_000 && !taken.has(s.id))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]
  return match?.id ?? null
}

/** session.json'a yazilacak surdurme referansi; ayar kapaliysa hic yazilmaz. */
export function persistedResume(tab: TerminalTab, settings: AppSettings): AgentSessionRef | undefined {
  if (!settings.resumeAgentsOnRestore) return undefined
  const agent: AgentKind | null = agentForProfile(settings, tab.profileId)
  if (agent && tab.agentHook?.sessionId) return { agent, id: tab.agentHook.sessionId }
  return tab.resumeSession
}
