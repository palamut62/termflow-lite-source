import { describe, expect, it } from 'vitest'
import { isSafeCopyPattern, normalizeSetupSteps, setupKey, suggestSetup } from './worktreeSetup'

describe('isSafeCopyPattern', () => {
  it('accepts relative paths and a glob in the last part', () => {
    for (const ok of ['.env', '.env*', 'config/local.json', 'config\\local.json', './.env', 'secrets/*.key']) expect(isSafeCopyPattern(ok), ok).toBe(true)
  })

  it('rejects anything that can leave the repository', () => {
    for (const bad of ['../secret', 'a/../../b', '/etc/passwd', '\\\\server\\share', 'C:\\x', 'c:x', '~/.ssh/id_rsa', 'file.txt:stream', '*/x.json', 'a//b', 'dir/', '', '   '])
      expect(isSafeCopyPattern(bad), bad).toBe(false)
  })
})

describe('suggestSetup', () => {
  it('suggests the install command for the lock file and .env copying', () => {
    expect(suggestSetup(['package-lock.json', '.env', 'src'])).toEqual({ copyFiles: ['.env*'], commands: ['npm ci'] })
    expect(suggestSetup(['pnpm-lock.yaml', 'requirements.txt'])).toEqual({ copyFiles: [], commands: ['pnpm install', 'pip install -r requirements.txt'] })
    expect(suggestSetup(['README.md'])).toEqual({ copyFiles: [], commands: [] })
  })
})

describe('normalizeSetupSteps', () => {
  it('drops unsafe paths, blanks and non-strings; enabled defaults to true', () => {
    expect(normalizeSetupSteps({ copyFiles: ['.env', '../x', 3, ' '], commands: [' npm ci ', null] })).toEqual({ copyFiles: ['.env'], commands: ['npm ci'], enabled: true })
    expect(normalizeSetupSteps({ enabled: false })).toEqual({ copyFiles: [], commands: [], enabled: false })
    expect(normalizeSetupSteps('x')).toBeNull()
  })
})

it('setupKey treats slash direction, case and trailing slashes as the same repo', () => {
  expect(setupKey('C:\\Work\\App\\')).toBe(setupKey('c:/work/app'))
})
