import { _electron as electron, chromium, expect, test } from '@playwright/test'
import type { Browser, ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { request } from 'http'

/**
 * Remote Access end to end: the real app serves the phone client on a
 * loopback address (E2E stand-in for the Tailscale IP), a mobile-sized
 * browser pairs through the QR link, types into a desktop tab, opens a tab,
 * changes a setting and is disconnected from the desktop.
 */

let app: ElectronApplication
let win: Page
let browser: Browser
let phone: Page
let userData = ''
const port = 41000 + Math.floor(Math.random() * 9000)

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-remote-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', motion: 'off', showTips: false, closeToTray: false, confirmBeforeClose: false, restoreSession: false,
    remote: { enabled: true, port }
  }))
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData, TERMFLOW_E2E_REMOTE_HOST: '127.0.0.1' }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
  // Windows has Edge; elsewhere the Playwright Chromium build is used.
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {})
  phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
})

test.afterEach(async () => {
  await browser?.close()
  if (app) await app.close()
  rmSync(userData, { recursive: true, force: true })
})

const desktopText = (): Promise<string> => win.evaluate(() => document.querySelector('.terminal-host .xterm-rows')?.textContent ?? '')
const phoneText = (): Promise<string> => phone.evaluate(() => document.querySelector('.term-host .xterm-rows')?.textContent ?? '')

test('a phone pairs by QR link, drives a desktop tab, opens tabs and changes settings', async () => {
  await expect.poll(() => win.evaluate(() => window.termflow.remote.status().then((s) => s.state))).toBe('running')

  // Desktop shows the QR in Settings > Remote Access.
  await win.keyboard.press('Control+,')
  await win.locator('.settings-nav-item', { hasText: 'Remote Access' }).click()
  await win.getByRole('button', { name: 'Show QR code' }).click()
  await expect(win.locator('.remote-qr')).toBeVisible()
  const pairUrl = await win.locator('.remote-pairing-info span', { hasText: 'Opens' }).textContent()
  expect(pairUrl).toContain(`127.0.0.1:${port}`)
  await win.screenshot({ path: 'test-results/remote-desktop-qr.png' })
  // Closing Settings voids the shown code on purpose; take a fresh one for the phone.
  await win.keyboard.press('Escape')
  const pairing = await win.evaluate(() => window.termflow.remote.pair())

  // The phone pairs; the code leaves the address bar right away.
  await phone.goto(pairing.url)
  await expect(phone.locator('.tab-chip.active')).toBeVisible({ timeout: 15_000 })
  expect(phone.url()).not.toContain('pair=')
  await expect(win.locator('.status-remote')).toBeVisible()

  // The top-right tab bar shows the connected phone and opens Remote Access.
  const indicator = win.locator('.remote-indicator')
  await expect(indicator).toBeVisible()
  await expect(indicator).toHaveAttribute('title', /connected/)
  await win.screenshot({ path: 'test-results/remote-desktop-indicator.png', clip: { x: 0, y: 0, width: 1280, height: 60 } })
  await indicator.click()
  await expect(win.locator('.settings-section-title', { hasText: 'Remote Access' })).toBeVisible()
  await win.keyboard.press('Escape')

  // Tapping the terminal opens the live keyboard; keys reach the shell one by one.
  await phone.locator('.term-host').tap()
  await expect(phone.locator('.phone-input')).toBeFocused()
  await expect(phone.locator('.compose')).toHaveCount(0)
  await phone.keyboard.type('echo live-abX')
  await phone.keyboard.press('Backspace')
  await phone.keyboard.type('c')
  await phone.keyboard.press('Enter')
  await expect.poll(phoneText, { timeout: 15_000 }).toContain('live-abc')
  await expect.poll(desktopText, { timeout: 15_000 }).toContain('live-abc')
  // Hiding the keyboard brings the message box back.
  await phone.getByRole('button', { name: 'Hide keyboard' }).click()
  await expect(phone.locator('.compose')).toBeVisible()

  // Type through the compose box; the command runs in the desktop tab.
  await phone.locator('.compose-input').fill('echo remote-$((40+2))-ok')
  await phone.locator('.send').click()
  await expect.poll(phoneText, { timeout: 15_000 }).toContain('remote-42-ok')
  await expect.poll(desktopText, { timeout: 15_000 }).toContain('remote-42-ok')
  await phone.screenshot({ path: 'test-results/remote-phone-terminal.png' })

  // Open a second tab from the phone; the desktop gets it too.
  const before = await win.locator('.tab-bar .tab-title').count()
  await phone.getByRole('button', { name: 'New tab' }).click()
  await phone.locator('.launch-group', { hasText: 'Shells' }).locator('.launch-item').first().click()
  await expect(phone.locator('.tab-chip:not(.add)')).toHaveCount(2)
  await expect.poll(() => win.locator('.tab-bar .tab-title').count()).toBe(before + 1)

  // A setting changed on the phone reaches the desktop.
  await phone.getByRole('button', { name: 'Settings' }).click()
  await phone.locator('.row', { hasText: 'Terminal' }).first().click()
  const confirm = phone.getByRole('switch', { name: 'Confirm before closing tabs' })
  await expect(confirm).toHaveAttribute('aria-checked', 'false')
  await confirm.click()
  await expect.poll(() => win.evaluate(() => window.termflow.settings.get().then((s) => s.confirmBeforeClose))).toBe(true)
  await phone.screenshot({ path: 'test-results/remote-phone-settings.png' })

  // Disconnecting on the desktop sends the phone back to pairing.
  const devices = await win.evaluate(() => window.termflow.remote.devices())
  expect(devices).toHaveLength(1)
  expect(devices[0].connected).toBe(true)
  await win.evaluate((id) => window.termflow.remote.revoke(id), devices[0].id)
  await expect(phone.getByText('This phone was disconnected from the computer')).toBeVisible()
  await expect(win.locator('.status-remote')).toHaveCount(0)
  await expect(win.locator('.remote-indicator')).toHaveCount(0)
})

test('the server refuses foreign origins and unknown tokens', async () => {
  await expect.poll(() => win.evaluate(() => window.termflow.remote.status().then((s) => s.state))).toBe('running')
  const base = `http://127.0.0.1:${port}`
  const pair = await fetch(`${base}/api/pair`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{"code":"x"}' })
  expect(pair.status).toBe(403)
  // fetch() cannot forge Host; a raw request stands in for a DNS-rebinding page.
  const rebindingStatus = await new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', headers: { Host: `evil.example:${port}` } }, (res) => { res.resume(); resolve(res.statusCode ?? 0) })
    req.on('error', reject)
    req.end()
  })
  expect(rebindingStatus).toBe(421)

  await phone.goto(base)
  await phone.evaluate(() => localStorage.setItem('termflow.remote.token', 'x'.repeat(43)))
  await phone.reload()
  await expect(phone.getByText('This phone was disconnected from the computer')).toBeVisible()
})
