// Jump palette (Ctrl+Shift+J) siralamasi. Spec: docs/orca-parity/jump-palette.md

import type { AgentSession, TerminalTab } from '../../shared/types'
import { attentionOrder } from './attention/attentionPolicy'
import { pathLabel } from './sessionRail'

export const IDLE_LIMIT = 9
const RESULT_LIMIT = 30

export type JumpItem =
  | { kind: 'tab'; tab: TerminalTab; at: number }
  | { kind: 'session'; session: AgentSession; at: number }

function tabItem(tab: TerminalTab, lastSeen: Map<string, number>): JumpItem {
  // Bekleyen sekmede "ne zaman" olayin zamanidir, son bakilan an degil.
  const at = (tab.attention && tab.agentHook?.at) || (lastSeen.get(tab.id) ?? tab.startedAt)
  return { kind: 'tab', tab, at }
}

/** Bos sorgu: once seni bekleyenler (needs-input, error, done), sonra en son bakilanlar; aktif sekme yok. */
export function idleTabs(tabs: TerminalTab[], activeTabId: string | null, lastSeen: Map<string, number>): JumpItem[] {
  const seen = (tab: TerminalTab): number => lastSeen.get(tab.id) ?? tab.startedAt
  const urgency = (a: TerminalTab, b: TerminalTab): number =>
    a.attention && b.attention ? attentionOrder(a.attention, b.attention) : a.attention ? -1 : b.attention ? 1 : 0
  return tabs
    .filter((tab) => tab.id !== activeTabId)
    .sort((a, b) => urgency(a, b) || seen(b) - seen(a))
    .slice(0, IDLE_LIMIT)
    .map((tab) => tabItem(tab, lastSeen))
}

/** 0 = eslesme yok; 3 kelime basinda, 2 kelime icinde, 1 harfler sirayla (bulanik). */
export function matchScore(query: string, text: string | undefined): number {
  if (!text) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const at = t.indexOf(q)
  if (at >= 0) return at === 0 || /[\s\\/._-]/.test(t[at - 1]) ? 3 : 2
  let i = 0
  for (const ch of t) if (ch === q[i] && ++i === q.length) return 1
  return 0
}

const label = (path: string | undefined): string | undefined => (path ? pathLabel(path) : undefined)

// Baslik / dal / klasor adi tam yoldan agir basar; yoksa "users" her sekmeyi esit getirirdi.
function tabScore(tab: TerminalTab, q: string): number {
  const folder = tab.cwd || tab.launchCwd
  return Math.max(
    3 * matchScore(q, tab.title),
    3 * matchScore(q, tab.worktree?.branch),
    2 * matchScore(q, label(folder)),
    2 * matchScore(q, label(tab.worktree?.repoRoot)),
    matchScore(q, tab.profileId),
    matchScore(q, folder)
  )
}

function sessionScore(session: AgentSession, q: string): number {
  return Math.max(
    3 * matchScore(q, session.title),
    2 * matchScore(q, label(session.cwd)),
    matchScore(q, session.agent),
    matchScore(q, session.cwd)
  )
}

/** Sorgu: acik sekmeler + acik olmayan son ajan oturumlari; puan, sonra sekme once, sonra yakinlik. */
export function searchJump(query: string, tabs: TerminalTab[], sessions: AgentSession[], lastSeen: Map<string, number>): JumpItem[] {
  const q = query.trim()
  if (!q) return []
  const openSessions = new Set(tabs.flatMap((tab) => [tab.agentHook?.sessionId, tab.resumeSession?.id]))
  const scored = [
    ...tabs.map((tab) => ({ item: tabItem(tab, lastSeen), score: tabScore(tab, q) })),
    ...sessions
      .filter((session) => !openSessions.has(session.id))
      .map((session) => ({ item: { kind: 'session', session, at: session.updatedAt } as JumpItem, score: sessionScore(session, q) }))
  ]
  const kindRank = (item: JumpItem): number => (item.kind === 'tab' ? 0 : 1)
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || kindRank(a.item) - kindRank(b.item) || b.item.at - a.item.at)
    .slice(0, RESULT_LIMIT)
    .map((entry) => entry.item)
}
