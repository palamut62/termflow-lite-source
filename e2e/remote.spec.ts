import { _electron as electron, chromium, expect, test } from '@playwright/test'
import type { Browser, ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { request } from 'http'
import QRCode from 'qrcode'

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

/** The phone opens on its Home screen (Orca Mobile); the tests that drive the shell go to Terminal first. */
async function openTerminal(): Promise<void> {
  await expect(phone.locator('.home-title')).toBeVisible({ timeout: 15_000 })
  await phone.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(phone.locator('.tab-chip.active')).toBeVisible({ timeout: 15_000 })
}

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
  const pairUrl = await win.locator('.remote-pairing-info span', { hasText: 'type the code' }).textContent()
  expect(pairUrl).toContain(`127.0.0.1:${port}`)
  await expect(win.locator('.remote-code')).toHaveText(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
  await win.screenshot({ path: 'test-results/remote-desktop-qr.png' })
  // Closing Settings voids the shown code on purpose; take a fresh one for the phone.
  await win.keyboard.press('Escape')
  const pairing = await win.evaluate(() => window.termflow.remote.pair())

  // The phone pairs; the code leaves the address bar right away.
  await phone.goto(pairing.url)
  await expect(phone.locator('.home-title')).toBeVisible({ timeout: 15_000 })
  await phone.screenshot({ path: 'test-results/remote-phone-home.png' })
  await openTerminal()
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

  // Mirroring (default): the shell still sees the desktop width; Fit hands it the phone width.
  const ptyWidth = async (tag: string): Promise<number> => {
    await phone.locator('.compose-input').fill(`"${tag}=$($Host.UI.RawUI.WindowSize.Width)"`)
    await phone.locator('.send').click()
    let width = 0
    await expect.poll(async () => {
      const match = new RegExp(`${tag}=(\\d+)`).exec(await phoneText())
      width = match ? Number(match[1]) : 0
      return width
    }, { timeout: 15_000 }).toBeGreaterThan(0)
    return width
  }
  expect(await ptyWidth('MIRROR')).toBeGreaterThan(80)
  await expect(phone.locator('.term-host')).toHaveAttribute('style', /scale/)
  // Zoom in on the mirrored terminal from the tab menu (the desktop is unaffected).
  await phone.locator('.tab-chip.active').click()
  for (let i = 0; i < 4; i++) await phone.getByRole('button', { name: 'Zoom in' }).click()
  await phone.keyboard.press('Escape')
  await phone.screenshot({ path: 'test-results/remote-phone-zoom.png' })
  await phone.getByRole('button', { name: 'Fit to phone' }).click()
  expect(await ptyWidth('FIT')).toBeLessThan(70)
  await phone.getByRole('button', { name: 'Fit to phone' }).click()
  expect(await ptyWidth('BACK')).toBeGreaterThan(80)

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

test('a home-screen app pairs by typing the code shown under the QR', async () => {
  await expect.poll(() => win.evaluate(() => window.termflow.remote.status().then((s) => s.state))).toBe('running')
  const pairing = await win.evaluate(() => window.termflow.remote.pair())
  expect(pairing.code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
  await phone.goto(`http://127.0.0.1:${port}/`)
  await expect(phone.locator('.pair-logo')).toHaveJSProperty('complete', true)
  expect(await phone.locator('.pair-logo').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  // Typed the way people do: lower case, without the dash.
  await phone.locator('#pair-code').fill(pairing.code.replace('-', '').toLowerCase())
  await phone.screenshot({ path: 'test-results/remote-phone-pair.png' })
  await phone.getByRole('button', { name: 'Pair', exact: true }).click()
  await openTerminal()
})

test('the pairing screen reads the QR from a photo', async () => {
  await expect.poll(() => win.evaluate(() => window.termflow.remote.status().then((s) => s.state))).toBe('running')
  const pairing = await win.evaluate(() => window.termflow.remote.pair())
  await phone.goto(`http://127.0.0.1:${port}/`)
  // The camera hands the page a photo; a rendered QR stands in for it.
  const photo = await QRCode.toBuffer(pairing.url, { type: 'png', width: 900, margin: 6 })
  await phone.locator('.pair-photo').setInputFiles({ name: 'IMG_0001.png', mimeType: 'image/png', buffer: photo })
  await openTerminal()
})

test('Reconnect on the desktop gives the same phone a new key', async () => {
  await expect.poll(() => win.evaluate(() => window.termflow.remote.status().then((s) => s.state))).toBe('running')
  // First pairing: the browser.
  const first = await win.evaluate(() => window.termflow.remote.pair())
  await phone.goto(first.url)
  await openTerminal()
  const [device] = await win.evaluate(() => window.termflow.remote.devices())

  // The desktop shows a renewal QR from the device row.
  await win.keyboard.press('Control+,')
  await win.locator('.settings-nav-item', { hasText: 'Remote Access' }).click()
  await win.getByRole('button', { name: `Reconnect ${device.name}` }).click()
  await expect(win.locator('.remote-code')).toBeVisible()
  const code = await win.locator('.remote-code').textContent()
  await win.screenshot({ path: 'test-results/remote-desktop-reconnect.png' })

  // The home-screen app has its own storage: a fresh context pairs with the code.
  const homeScreen = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await homeScreen.goto(`http://127.0.0.1:${port}/`)
  await homeScreen.locator('#pair-code').fill(code!)
  await homeScreen.getByRole('button', { name: 'Pair', exact: true }).click()
  await expect(homeScreen.locator('.home-title')).toBeVisible({ timeout: 15_000 })

  // Same entry, new key: the old browser session is retired and the QR closes.
  await expect(phone.getByText('This phone was disconnected from the computer')).toBeVisible()
  const devices = await win.evaluate(() => window.termflow.remote.devices())
  expect(devices.map((d) => d.id)).toEqual([device.id])
  await expect(win.locator('.remote-qr')).toHaveCount(0)
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
