import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/**
 * Panoda yalnız resim varken (ekran alıntısı) sağ tık > Paste, resmi PNG
 * olarak kaydedip yolunu terminale yapıştırmalı.
 */

let app: ElectronApplication | undefined
let win: Page | undefined
const cleanup: string[] = []

test.afterEach(async () => {
  if (app) await app.close()
  for (const d of cleanup) rmSync(d, { recursive: true, force: true })
  cleanup.length = 0
})

test('pasting a clipboard image inserts the path of a saved PNG', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'termflow-pasteimg-userdata-'))
  cleanup.push(userData)
  app = await electron.launch({
    args: [resolve('.'), '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
  const host = win.locator('.terminal-view').first().locator('.terminal-host')
  await host.click()
  await win.waitForTimeout(2500)

  // Test ortamında OS panosu güvenilir değil (yazılan geri okunamıyor); main
  // süreçteki okuma çağrılarını "yalnız resim var" panosuyla değiştir.
  await app.evaluate(({ clipboard, nativeImage }) => {
    // 2x2 opak beyaz bitmap (BGRA).
    const image = nativeImage.createFromBitmap(Buffer.alloc(16, 255), { width: 2, height: 2 })
    clipboard.readText = (): string => ''
    clipboard.readBuffer = (): Buffer => Buffer.alloc(0)
    clipboard.readImage = (): Electron.NativeImage => image
  })

  await win.keyboard.type('echo ')
  await host.click({ button: 'right' })
  await win.getByRole('menuitem', { name: 'Paste' }).click()
  await win.waitForTimeout(500)
  // WebGL renderer metni DOM'a koymaz; yapıştırılan yolu dosyadan oku.
  const out = join(userData, 'out.txt')
  await win.keyboard.type(` | Out-File -Encoding utf8 '${out}'`)
  await win.keyboard.press('Enter')

  await expect.poll(() => existsSync(out), { timeout: 10000 }).toBe(true)
  const pasted = readFileSync(out, 'utf8').replace(/^﻿/, '').trim()
  expect(pasted).toMatch(/termflow-lite-paste[\\/]clipboard-\d{8}-\d{6}-\d{3}\.png$/)
  expect(existsSync(pasted)).toBe(true)
  expect(readFileSync(pasted).subarray(1, 4).toString()).toBe('PNG')
  cleanup.push(pasted)
})
