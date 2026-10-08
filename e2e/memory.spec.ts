import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { projectSlug } from '../src/main/memory/projectKey'

/**
 * Agent Memory settings: off by default, an in-app consent before enabling,
 * project memory listed and previewed, and the MCP server script installed to a
 * stable userData path. Connect buttons are not clicked: they would change the
 * developer's real Claude/Codex/OpenCode configuration.
 */

let app: ElectronApplication
let win: Page
let userData = ''
const projectFile = (): string => join(userData, 'memory', 'projects', `${projectSlug('c:\\work\\demo')}.md`)

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-memory-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ gpuAcceleration: 'off', motion: 'off', showTips: false, closeToTray: false, confirmBeforeClose: false, restoreSession: false }))
  const projects = join(userData, 'memory', 'projects')
  mkdirSync(projects, { recursive: true })
  writeFileSync(projectFile(), [
    '---', 'project: C:\\work\\demo', 'key: c:\\work\\demo', 'generatedAt: 2026-10-06T12:00:00.000Z',
    'lastSessionAt: 2026-10-06T11:00:00.000Z', 'sessions: 4', '---',
    '## Status', 'Checkout flow is half done', '## Unfinished', '- Payment retry screen', ''
  ].join('\n'))
  app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData } })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
})

test.afterEach(async () => {
  if (app) await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('memory settings: consent, status, project preview and server install', async () => {
  expect(existsSync(join(userData, 'mcp', 'memory-server.cjs'))).toBe(true)

  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.locator('.settings-nav-item', { hasText: 'Memory' }).click()
  await expect(win.locator('.settings-section-title', { hasText: 'Agent Memory' })).toBeVisible()
  await expect(win.locator('.memory-status')).toHaveText('Off')

  const toggle = win.getByRole('switch', { name: 'Enable agent memory' })
  await toggle.click()
  await expect(win.getByRole('alertdialog', { name: 'Enable agent memory' })).toContainText('File contents and command output are never sent')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await win.locator('.memory-consent .settings-btn-primary').click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('.memory-status')).toHaveText('Waiting for an OpenRouter API key')
  await expect(win.getByRole('button', { name: 'Update now' })).toBeDisabled()

  await expect(win.locator('.profile-row', { hasText: 'Claude Code' })).toBeVisible()
  await expect(win.locator('.profile-row', { hasText: 'OpenCode' })).toBeVisible()

  const project = win.locator('.profile-row', { hasText: 'C:\\work\\demo' })
  await expect(project).toContainText('4 sessions · Checkout flow is half done')
  await project.getByRole('button', { name: 'View' }).click()
  await expect(win.locator('.memory-preview')).toContainText('- Payment retry screen')
  await expect(win.locator('.memory-preview')).not.toContainText('generatedAt')
  await win.screenshot({ path: 'test-results/memory-settings.png' })

  await project.getByRole('button', { name: 'Exclude' }).click()
  await expect(win.locator('.settings-section-title', { hasText: 'Excluded projects' })).toBeVisible()
  await expect(win.locator('.profile-row', { hasText: '4 sessions' })).toHaveCount(0)
  expect(existsSync(projectFile())).toBe(false)
})

test('memory model picker reads the cached OpenRouter list without a network call', async () => {
  // Taze cache: uygulama ağa çıkmadan bu listeyi göstermeli.
  const cache = join(userData, 'cache')
  mkdirSync(cache, { recursive: true })
  writeFileSync(join(cache, 'openrouter-models.json'), JSON.stringify({
    fetchedAt: Date.now(),
    models: [
      { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextLength: 1048576, inputPrice: 0.0228, outputPrice: 1.28, structured: true },
      { id: 'plain/no-schema', name: 'Plain', contextLength: 8192, inputPrice: 0, outputPrice: 0, structured: false }
    ]
  }))

  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.locator('.settings-nav-item', { hasText: 'Memory' }).click()
  await expect(win.getByText('2 OpenRouter models', { exact: false })).toBeVisible()
  await expect(win.locator('#memory-models option')).toHaveCount(2)
  await expect(win.locator('.memory-model-info')).toContainText('DeepSeek V4 Flash · 1M context · $0.023 in / $1.28 out per 1M tokens')
  // Anahtar yokken test edilemez.
  await expect(win.getByRole('button', { name: 'Test' })).toBeDisabled()

  const input = win.getByPlaceholder('Search OpenRouter models')
  await input.fill('plain/no-schema')
  await expect(win.locator('.memory-model-info')).toContainText('free · no structured output, summaries may fail')
  await input.fill('made/up-model')
  await expect(win.locator('.memory-model-info')).toContainText('Not in the OpenRouter model list')
  await win.screenshot({ path: 'test-results/memory-models.png' })
})
