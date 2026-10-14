import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * agent-hooks (docs/orca-parity/agent-hooks.md): a stand-in "claude" reads the
 * --settings file TermFlow passes, then calls its HTTP hooks the way Claude Code
 * does (headers from env). The tab follows working -> needs input -> done
 * without guessing from the screen.
 */

const FAKE_CLAUDE = String.raw`
const fs = require('fs')
const http = require('http')
const args = process.argv.slice(2)
const settingsFile = args[args.indexOf('--settings') + 1]
const hooks = args.includes('--settings') ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hooks : {}
function fire(name, extra) {
  const hook = hooks[name] && hooks[name][0].hooks[0]
  if (!hook) return Promise.resolve()
  const headers = {}
  for (const [key, value] of Object.entries(hook.headers)) headers[key] = value.replace(/\$(\w+)/g, (_, v) => process.env[v] || '')
  return new Promise((resolve) => {
    const req = http.request(hook.url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' } }, (res) => { res.resume(); resolve() })
    req.on('error', resolve)
    req.end(JSON.stringify({ session_id: 'e2e-session-1', hook_event_name: name, ...extra }))
  })
}
const say = (text) => process.stdout.write(text)
fire('SessionStart', { source: 'startup' }).then(() => say('fake claude ready\r\n> '))
let awaiting = false
let line = ''
process.stdin.setRawMode && process.stdin.setRawMode(true)
process.stdin.on('data', async (chunk) => {
  for (const ch of chunk.toString()) {
    if (ch !== '\r' && ch !== '\n') { line += ch; say(ch); continue }
    const input = line; line = ''
    say('\r\n')
    if (awaiting) {
      awaiting = false
      await fire('PostToolUse', { tool_name: 'Bash' })
      say('approved, finishing\r\n')
      setTimeout(async () => { await fire('Stop', { last_assistant_message: 'All done: ' + input }); say('> ') }, 1500)
    } else {
      await fire('UserPromptSubmit', { prompt: input })
      say('thinking about ' + input + '\r\n')
      setTimeout(async () => { await fire('PermissionRequest', { tool_name: 'Bash' }); awaiting = true; say('Allow Bash? (y/n) ') }, 1500)
    }
  }
})
`

let app: ElectronApplication
let win: Page
let folder = ''

async function launch(agentHooks: boolean): Promise<void> {
  folder = mkdtempSync(join(tmpdir(), 'termflow-e2e-hooks-'))
  const userData = join(folder, 'user-data')
  writeFileSync(join(folder, 'claude.js'), FAKE_CLAUDE)
  let command: string
  if (process.platform === 'win32') {
    command = join(folder, 'claude.cmd')
    // Same shape as an npm shim, so TermFlow resolves it to node + claude.js.
    writeFileSync(command, '@node "%~dp0\\claude.js" %*\r\n')
  } else {
    command = join(folder, 'claude')
    writeFileSync(command, `#!/usr/bin/env node\nrequire(${JSON.stringify(join(folder, 'claude.js'))})\n`)
    chmodSync(command, 0o755)
  }
  require('fs').mkdirSync(userData)
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', motion: 'off', showTips: false, closeToTray: false, confirmBeforeClose: false, restoreSession: false,
    agentCompanion: false, agentHooks, defaultAgentPermissionMode: 'workspace', defaultProfileId: 'fake-claude',
    profiles: [{ id: 'fake-claude', name: 'Fake Claude', command, args: [], fullPermissions: false }]
  }))
  app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData } })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
}

test.afterEach(async () => {
  if (app) await app.close()
  rmSync(folder, { recursive: true, force: true })
})

const terminalText = (): Promise<string> => win.evaluate(() => document.querySelector('.terminal-host .xterm-rows')?.textContent ?? '')
const activity = (): Promise<string | null> => win.locator('.tab-process-indicator').first().getAttribute('aria-label')

test('a Claude tab follows the agent hooks: working, needs input, done', async () => {
  await launch(true)
  await expect.poll(terminalText, { timeout: 20_000 }).toContain('fake claude ready')
  // Before the first prompt there is no hook (SessionStart has no http hooks); the prompt heuristic applies.
  await expect.poll(activity, { timeout: 5_000 }).toBe('Activity: waiting')

  await win.locator('.terminal-host .xterm').first().click()
  await win.keyboard.type('fix login')
  await win.keyboard.press('Enter')
  await expect.poll(activity, { timeout: 5_000 }).toBe('Activity: running')
  await expect.poll(terminalText, { timeout: 10_000 }).toContain('Allow Bash?')
  await expect.poll(activity, { timeout: 5_000 }).toBe('Activity: waiting')

  await win.keyboard.type('y')
  await win.keyboard.press('Enter')
  await expect.poll(activity, { timeout: 5_000 }).toBe('Activity: running')
  await expect.poll(activity, { timeout: 10_000 }).toBe('Activity: completed')
  // The prompt the fake agent redraws afterwards must not flip the tab back.
  await win.waitForTimeout(800)
  expect(await activity()).toBe('Activity: completed')
})

test('with agent status hooks off, no settings file is passed', async () => {
  await launch(false)
  await expect.poll(terminalText, { timeout: 20_000 }).toContain('fake claude ready')
  await win.locator('.terminal-host .xterm').first().click()
  await win.keyboard.type('x')
  await win.keyboard.press('Enter')
  await expect.poll(terminalText, { timeout: 10_000 }).toContain('Allow Bash?')
  // Without hooks the old prompt heuristic still drives the tab.
  expect(await activity()).not.toBe('Activity: completed')
})
