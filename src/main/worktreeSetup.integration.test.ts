import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { copySetupFiles, expandCopyPatterns, runSetupCommand } from './worktreeSetup'

let base = ''
let repo = ''
let tree = ''

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'tf-setup-'))
  repo = join(base, 'repo')
  tree = join(base, 'tree')
  mkdirSync(join(repo, 'config'), { recursive: true })
  mkdirSync(tree)
  writeFileSync(join(repo, '.env'), 'KEY=1')
  writeFileSync(join(repo, '.env.local'), 'LOCAL=1')
  writeFileSync(join(repo, '.env.example'), 'KEY=')
  writeFileSync(join(repo, 'config', 'local.json'), '{}')
  writeFileSync(join(base, 'secret'), 'outside')
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('copySetupFiles', () => {
  it('copies matching files, keeps files the checkout already has', () => {
    writeFileSync(join(tree, '.env.example'), 'TRACKED')
    const result = copySetupFiles(repo, tree, ['.env*', 'config/local.json', 'missing.txt'])
    expect(result.copied.sort()).toEqual(['.env', '.env.local', join('config', 'local.json')].sort())
    expect(result.skipped).toEqual(['.env.example'])
    expect(readFileSync(join(tree, '.env'), 'utf8')).toBe('KEY=1')
    expect(readFileSync(join(tree, '.env.example'), 'utf8')).toBe('TRACKED')
  })

  it('never reads outside the repository', () => {
    expect(expandCopyPatterns(repo, ['../secret', join(base, 'secret'), 'config'])).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('skips symlinks that point outside', () => {
    symlinkSync(join(base, 'secret'), join(repo, 'link.txt'))
    symlinkSync(base, join(repo, 'outside'))
    expect(expandCopyPatterns(repo, ['link.txt', 'outside/secret'])).toEqual([])
  })
})

describe('runSetupCommand', () => {
  it('runs in the worktree and streams output', async () => {
    let output = ''
    const run = runSetupCommand('node -e "require(\'fs\').writeFileSync(\'ran.txt\',\'ok\');console.log(\'hello\')"', tree, (text) => { output += text })
    expect(await run.done).toEqual({ code: 0, timedOut: false })
    expect(output).toContain('hello')
    expect(existsSync(join(tree, 'ran.txt'))).toBe(true)
  })

  it('reports a failing exit code', async () => {
    expect((await runSetupCommand('node -e "process.exit(3)"', tree, () => undefined).done).code).toBe(3)
  })

  it('stops a step that runs past its timeout', async () => {
    const result = await runSetupCommand('node -e "setTimeout(() => {}, 60000)"', tree, () => undefined, 500).done
    expect(result.timedOut).toBe(true)
    expect(result.code).not.toBe(0)
  }, 15_000)
})
