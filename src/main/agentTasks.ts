import { readdir, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AgentTask } from '../shared/ipc'

const SESSION_ID = /^[\w-]{1,100}$/

/** Claude Code arka plan gorev ciktilari: <tmp>/claude/<proje>/<oturum>/tasks/<id>.output. */
export function claudeTasksRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.CLAUDE_CODE_TMPDIR || tmpdir(), 'claude')
}

/** Oturumun gorev ciktilari, en son yazilan once. Dosya gorev bitince de kalir; "calisiyor" bilgisi yok. */
export async function listAgentTasks(sessionId: string, root = claudeTasksRoot()): Promise<AgentTask[]> {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id')
  const projects = await readdir(root).catch(() => [] as string[])
  const tasks: AgentTask[] = []
  for (const project of projects) {
    const dir = join(root, project, sessionId, 'tasks')
    const files = await readdir(dir).catch(() => [] as string[])
    for (const file of files) {
      if (!file.endsWith('.output')) continue
      const info = await stat(join(dir, file)).catch(() => null)
      if (info?.isFile()) tasks.push({ id: file.slice(0, -'.output'.length), path: join(dir, file), size: info.size, mtimeMs: info.mtimeMs })
    }
  }
  return tasks.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 50)
}
