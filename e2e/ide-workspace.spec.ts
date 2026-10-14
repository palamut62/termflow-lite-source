import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** Agent IDE Faz 1 (docs/agent-ide/PRD.md F1.1-F1.4): project tree and the right panel. IDE build only. */

let app: ElectronApplication
let win: Page
let folder = ''

test.beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'termflow-e2e-idews-'))
  const repo = join(folder, 'shop-api')
  mkdirSync(repo)
  const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }) }
  git('init', '-b', 'main')
  git('-c', 'user.email=e2e@test', '-c', 'user.name=e2e', 'commit', '--allow-empty', '-m', 'init')
  git('worktree', 'add', '-b', 'fix-login', join(repo, '.termflow-worktrees', 'fix-login'))
  const userData = join(folder, 'user-data')
  mkdirSync(userData)
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', motion: 'off', showTips: false, closeToTray: false, confirmBeforeClose: false, restoreSession: false, agentCompanion: false,
    uiMode: 'ide', uiModeChosen: true, startupDirectory: 'custom', customStartupDirectory: repo,
    ide: { projects: [repo], sidebarWidth: 260, rightWidth: 300, rightOpen: true, rightTab: 'explorer' }
  }))
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData } })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
})

test.afterEach(async () => {
  if (app) await app.close()
  rmSync(folder, { recursive: true, force: true })
})

test('the tree shows the project, its worktrees and the open terminal', async () => {
  const tree = win.getByRole('tree', { name: 'Projects' })
  await expect(tree.locator('.ide-tree-project')).toHaveText(/shop-api/)
  const main = tree.locator('.ide-tree-worktree', { hasText: 'main' })
  await expect(main.locator('.ide-badge')).toHaveText('primary')
  await expect(tree.locator('.ide-child-chip')).toHaveText(/1 child/)
  await expect(tree.locator('.ide-tree-worktree', { hasText: 'fix-login' })).toBeVisible()
  // The startup terminal opened in the repo sits under the primary checkout.
  await expect(tree.locator('.ide-tree-session')).toHaveCount(1)
  await win.screenshot({ path: 'test-results/ide-workspace.png' })

  // A worktree without a terminal opens one in its folder.
  await tree.locator('.ide-tree-worktree', { hasText: 'fix-login' }).click()
  await expect(win.locator('.tab')).toHaveCount(2)
  await expect(tree.locator('.ide-card-child', { hasText: 'fix-login' }).locator('.ide-tree-session')).toHaveCount(1)
  await expect(tree.locator('.ide-tree-active')).toHaveCount(1)
})

test('the right panel lists files, switches to Agents and hides with its shortcut', async () => {
  const panel = win.getByRole('complementary', { name: 'Workspace panel' })
  await expect(panel.getByText('README.md')).toBeVisible({ timeout: 10_000 })
  await panel.getByRole('tab', { name: 'Agents' }).click()
  await expect(panel.getByRole('radio', { name: 'Workspace' })).toHaveAttribute('aria-checked', 'true')
  await win.locator('.terminal-host .xterm').first().click()
  await win.keyboard.press('Control+Shift+A')
  await expect(panel).toHaveCount(0)
  await win.keyboard.press('Control+Shift+E')
  await expect(win.getByRole('tab', { name: 'Explorer' })).toHaveAttribute('aria-selected', 'true')
})
