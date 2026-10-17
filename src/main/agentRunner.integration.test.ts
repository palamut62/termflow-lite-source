// Integration: gercek git + sahte ajan surecleri (node -e). Ajan CLI'i cagrilmaz, ag yok.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { discardTask, runDelegatedTask } from './agentRunner'

function hasGit(): boolean {
  try {
    execFileSync('git', ['--version'], { windowsHide: true, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const describeGit = hasGit() ? describe : describe.skip
const fakeAgent = (script: string): { file: string; args: string[] } => ({ file: process.execPath, args: ['-e', script] })
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describeGit('runDelegatedTask', () => {
  let sandbox = ''
  let repo = ''
  let n = 0
  const id = (): string => `t${Date.now().toString(36)}${n++}`

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'termflow-deleg-'))
    repo = join(sandbox, 'app')
    execFileSync('git', ['init', '-q', repo], { windowsHide: true })
    writeFileSync(join(repo, 'README.md'), 'hi\n')
    const git = (args: string[]): void => { execFileSync('git', args, { cwd: repo, windowsHide: true, stdio: 'ignore' }) }
    git(['add', '.'])
    git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
  })

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('runs the agent in its own worktree, reports the diff and passes the check', async () => {
    const script = `require('fs').writeFileSync('out.txt','x');console.log(JSON.stringify({type:'text',part:{type:'text',text:'tamam'}}))`
    const result = await runDelegatedTask({
      id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p', invocation: fakeAgent(script),
      checkCommand: `node -e "process.exit(require('fs').existsSync('out.txt')?0:1)"`
    }).done
    expect(result.status).toBe('done')
    expect(result.lastMessage).toBe('tamam')
    expect(result.changedFiles).toEqual(['out.txt'])
    expect(result.diffStat).toContain('out.txt')
    expect(result.check?.code).toBe(0)
    // Ana calisma agacina dokunulmaz.
    expect(existsSync(join(repo, 'out.txt'))).toBe(false)
    expect(await discardTask(repo, result)).toEqual({ ok: true })
    expect(existsSync(result.worktreePath!)).toBe(false)
    expect(execFileSync('git', ['branch', '--list', result.branch], { cwd: repo, windowsHide: true }).toString().trim()).toBe('')
  })

  it('gives the agent the worktree as PWD, not the parent process directory', async () => {
    const script = `require('fs').writeFileSync(require('path').join(process.env.PWD,'pwd.txt'),process.cwd())`
    const result = await runDelegatedTask({ id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p', invocation: fakeAgent(script) }).done
    expect(result.status).toBe('done')
    expect(result.changedFiles).toEqual(['pwd.txt'])
    expect(existsSync(join(process.cwd(), 'pwd.txt'))).toBe(false)
    await discardTask(repo, result)
  })

  it('fails when the agent exits 0 without changing anything', async () => {
    const result = await runDelegatedTask({ id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p', invocation: fakeAgent('') }).done
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Agent made no changes')
    await discardTask(repo, result)
  })

  it('fails with the check output when the acceptance check does not pass', async () => {
    const result = await runDelegatedTask({
      id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p',
      invocation: fakeAgent(`require('fs').writeFileSync('a.txt','x')`),
      checkCommand: 'node -e "console.log(\'nope\');process.exit(3)"'
    }).done
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Check command failed')
    expect(result.check?.code).toBe(3)
    expect(result.check?.output).toContain('nope')
    await discardTask(repo, result)
  })

  it('reports a provider error even when files changed', async () => {
    const script = `require('fs').writeFileSync('a.txt','x');console.log(JSON.stringify({type:'error',error:{data:{message:'Insufficient Balance'}}}));process.exit(1)`
    const result = await runDelegatedTask({ id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p', invocation: fakeAgent(script) }).done
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Insufficient Balance')
    await discardTask(repo, result)
  })

  it('kills the whole process tree on timeout so no orphan keeps running', async () => {
    const pidFile = join(sandbox, `grandchild-${n}.pid`)
    const script = [
      `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})`,
      `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid))`,
      'setInterval(()=>{},1000)'
    ].join(';')
    const result = await runDelegatedTask({ id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p', invocation: fakeAgent(script), timeoutMs: 2000 }).done
    expect(result.status).toBe('timeout')
    const grandchild = Number(readFileSync(pidFile, 'utf8'))
    let waited = 0
    while (alive(grandchild) && waited < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      waited += 100
    }
    expect(alive(grandchild)).toBe(false)
    await discardTask(repo, result)
  }, 20_000)

  it('cancels a running task', async () => {
    const run = runDelegatedTask({ id: id(), repoRoot: repo, agent: 'opencode', prompt: 'p', invocation: fakeAgent('setInterval(()=>{},1000)') })
    setTimeout(() => run.cancel(), 1500)
    const result = await run.done
    expect(result.status).toBe('cancelled')
    await discardTask(repo, result)
  }, 20_000)

  it('fails cleanly when the repository does not exist', async () => {
    const result = await runDelegatedTask({ id: id(), repoRoot: join(sandbox, 'missing'), agent: 'opencode', prompt: 'p' }).done
    expect(result.status).toBe('failed')
    expect(result.worktreePath).toBeUndefined()
  })
})
