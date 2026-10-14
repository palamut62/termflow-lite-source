import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { delimiter, join } from 'path'

/**
 * Installed agent CLIs are found on PATH and show up as ready-made full-access
 * profiles; installing one while the app runs adds it without manual setup.
 * Real agents on the machine may also be found, so only the fake ones are asserted.
 */

let app: ElectronApplication
let win: Page
let folder = ''
let bin = ''

function fakeCli(name: string): void {
  if (process.platform === 'win32') writeFileSync(join(bin, `${name}.cmd`), '@echo off\r\n')
  else {
    writeFileSync(join(bin, name), '#!/bin/sh\n')
    chmodSync(join(bin, name), 0o755)
  }
}

test.beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'termflow-e2e-detect-'))
  bin = join(folder, 'bin')
  mkdirSync(bin)
  mkdirSync(join(folder, 'user-data'))
  writeFileSync(join(folder, 'user-data', 'settings.json'), JSON.stringify({ gpuAcceleration: 'off', motion: 'off', showTips: false, closeToTray: false, confirmBeforeClose: false, restoreSession: false }))
  fakeCli('amp')
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, [pathKey]: `${bin}${delimiter}${process.env[pathKey] ?? ''}`, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: join(folder, 'user-data') }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.tab')
})

test.afterEach(async () => {
  if (app) await app.close()
  rmSync(folder, { recursive: true, force: true })
})

test('agents on PATH appear in the New Tab menu, new installs are picked up', async () => {
  await win.click('.new-tab-caret')
  await expect(win.getByRole('menuitem', { name: 'Amp' })).toBeVisible()
  await expect(win.getByRole('menuitem', { name: 'Crush' })).toHaveCount(0)
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+,')
  await win.locator('.settings-nav-item', { hasText: 'Profiles' }).click()
  const crush = win.locator('.profile-row', { hasText: 'Crush' })
  await expect(crush).toContainText('Not installed')
  await expect(win.locator('.profile-row', { hasText: 'Amp' })).toContainText('Full access: --dangerously-allow-all')

  // Installed while TermFlow is open.
  fakeCli('crush')
  await win.getByRole('button', { name: 'Rescan installed agents' }).click()
  await expect(crush).not.toContainText('Not installed')
  await expect(win.getByText('Crush found. Open it from the New Tab menu.')).toBeVisible()
  await win.screenshot({ path: 'test-results/agent-detect.png' })
})
