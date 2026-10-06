import type { ChatMessage } from './openrouter'
import { parseJsonObject } from './openrouter'
import type { SessionSummary, StoredSession } from './store'

export const MAX_PROJECT_CHARS = 4_000
const MAX_MERGE_INPUT_CHARS = 60_000

const LANGUAGE_RULE = 'Language: write every sentence in the same natural language as the user requests (for example Turkish requests -> Turkish output), even if these instructions are English. Keep code identifiers, file paths and commands unchanged.'

export const SESSION_SCHEMA = {
  name: 'session_summary',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['goal', 'done', 'unfinished', 'problems', 'decisions', 'lastState'],
    properties: {
      goal: { type: 'string', description: 'What the user wanted in this session, one sentence.' },
      done: { type: 'array', items: { type: 'string' }, description: 'Concrete completed work.' },
      unfinished: { type: 'array', items: { type: 'string' }, description: 'Work started or requested but not finished.' },
      problems: { type: 'array', items: { type: 'string' }, description: 'Bugs or blockers still open at the end: user-reported issues, checks still failing. Not transient command errors.' },
      decisions: { type: 'array', items: { type: 'string' }, description: 'Lasting technical/product decisions or user preferences that should guide future work. Not one-off tasks.' },
      lastState: { type: 'string', description: 'Where the session stopped, one or two sentences.' }
    }
  }
}

export function sessionMessages(digestText: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You condense one coding-agent session into a factual work log for a later agent.',
        'Only use facts present in the digest. Do not invent work, files or results.',
        'A task marked [x] is done, [~] is in progress, [ ] is pending. "Ended: interrupted" means the last request may be unfinished.',
        '"Command failures" are raw errors during the work and usually transient: never copy them; mention one only if it was still unresolved at the end.',
        'A failed check that later passes is not a problem. Be specific: name files and features.',
        'Each list item is one short line. Empty lists are fine. Return JSON only.',
        LANGUAGE_RULE
      ].join('\n')
    },
    { role: 'user', content: digestText }
  ]
}

const strings = (value: unknown, max = 12): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().slice(0, 300)).slice(0, max) : []

export function parseSessionSummary(content: string): SessionSummary | null {
  const value = parseJsonObject(content)
  if (!value) return null
  const summary: SessionSummary = {
    goal: typeof value.goal === 'string' ? value.goal.trim().slice(0, 300) : '',
    done: strings(value.done),
    unfinished: strings(value.unfinished),
    problems: strings(value.problems),
    decisions: strings(value.decisions),
    lastState: typeof value.lastState === 'string' ? value.lastState.trim().slice(0, 400) : ''
  }
  return summary.goal || summary.done.length || summary.unfinished.length ? summary : null
}

const day = (time: number): string => new Date(time).toISOString().slice(0, 10)

function sessionBlock(session: StoredSession): string {
  const s = session.summary!
  const list = (title: string, items: string[]): string => items.length ? `${title}:\n${items.map((item) => `- ${item}`).join('\n')}\n` : ''
  return [
    `### ${day(session.updatedAt)} ${session.agent}${session.interrupted ? ' (ended interrupted)' : ''}`,
    `Goal: ${s.goal}`,
    list('Done', s.done) + list('Unfinished', s.unfinished) + list('Problems', s.problems) + list('Decisions', s.decisions),
    `Stopped at: ${s.lastState}`,
    session.files?.length ? `Files: ${session.files.slice(-15).join(', ')}` : ''
  ].filter(Boolean).join('\n')
}

/** Oturumlar eskiden yeniye; bütçe aşılırsa en eskiler düşer. */
export function mergeMessages(projectPath: string, sessions: StoredSession[]): ChatMessage[] {
  const blocks: string[] = []
  let used = 0
  for (const session of [...sessions].reverse()) {
    const block = sessionBlock(session)
    if (used + block.length > MAX_MERGE_INPUT_CHARS) break
    blocks.unshift(block)
    used += block.length
  }
  return [
    {
      role: 'system',
      content: [
        'You maintain the project memory that coding agents read at the start of a session.',
        'Input: dated session logs of one project, oldest first. Output: Markdown with exactly these sections:',
        '## Status (1-3 lines: what the project is and where it stands now)',
        '## Unfinished (only items NOT completed by a later session; newest first; say where it stopped)',
        '## Open problems (only real unresolved issues; no raw command errors)',
        '## Done (dated, newest first, compressed; merge related items)',
        '## Decisions (lasting technical/product decisions and user preferences; not one-off tasks)',
        'Later sessions override earlier ones. Drop anything that was resolved.',
        'Leave out a section entirely when it has nothing (no "none" placeholders), except Status. Do not mention log field names such as "answered" or "interrupted".',
        `Stay under ${MAX_PROJECT_CHARS - 300} characters. No preamble, no code fences, no title line.`,
        LANGUAGE_RULE
      ].join('\n')
    },
    { role: 'user', content: `Project: ${projectPath}\n\n${blocks.join('\n\n')}` }
  ]
}

export function projectMarkdown(input: { key: string; path: string; body: string; now: number; sessions: StoredSession[] }): string {
  const body = input.body.trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').replace(/^#\s+[^\n]*\n+/, '').trim()
  const clipped = body.length > MAX_PROJECT_CHARS ? `${body.slice(0, MAX_PROJECT_CHARS).replace(/\n[^\n]*$/, '')}\n…` : body
  const last = Math.max(...input.sessions.map((session) => session.updatedAt))
  return [
    '---',
    `project: ${input.path}`,
    `key: ${input.key}`,
    `generatedAt: ${new Date(input.now).toISOString()}`,
    `lastSessionAt: ${new Date(last).toISOString()}`,
    `sessions: ${input.sessions.length}`,
    '---',
    clipped,
    ''
  ].join('\n')
}
