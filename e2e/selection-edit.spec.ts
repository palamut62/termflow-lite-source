import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/**
 * Çift tıkla seçilen kelimenin üzerine yazma: yazılan metin seçimin yerine
 * geçmeli, satır sonuna eklenmemeli.
 */

let app: ElectronApplication | undefined
let win: Page | undefined
const cleanup: string[] = []

test.afterEach(async () => {
  if (app) await app.close()
  for (const d of cleanup) rmSync(d, { recursive: true, force: true })
  cleanup.length = 0
})

/** Aktif terminalin imleç (helper textarea) konumu, sayfa koordinatında. */
async function caret(page: Page): Promise<{ x: number; y: number; h: number }> {
  return page.evaluate(() => {
    const ta = document.querySelector('.terminal-view:not(.inactive) .xterm-helper-textarea') as HTMLElement
    const r = ta.getBoundingClientRect()
    return { x: r.left, y: r.top, h: r.height }
  })
}

test('typing over a double-clicked word replaces it in place', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'termflow-seledit-userdata-'))
  cleanup.push(userData)
  app = await electron.launch({
    args: [resolve('.'), '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
  await win.locator('.terminal-view').first().locator('.terminal-host').click()
  await win.waitForTimeout(2500)

  await win.keyboard.type('echo alpha bravo charlie')
  await win.waitForTimeout(500)
  const end = await caret(win)
  await win.keyboard.type('zz')
  await win.waitForTimeout(500)
  const cellW = ((await caret(win)).x - end.x) / 2
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')
  await win.waitForTimeout(300)
  expect(cellW).toBeGreaterThan(2)

  // "bravo" sonu imleçten " charlie" (8 karakter) kadar solda; ortasına çift tık.
  await win.mouse.dblclick(end.x - (8 + 2.5) * cellW, end.y + end.h / 2)
  await win.waitForTimeout(300)
  await win.keyboard.type('XYZ')
  // WebGL renderer metni DOM'a koymaz; sonucu dosyadan oku.
  await win.keyboard.press('End')
  const out = join(userData, 'out.txt')
  await win.keyboard.type(` | Out-File -Encoding ascii '${out}'`)
  await win.screenshot({ path: 'test-results/selection-edit.png' })
  await win.keyboard.press('Enter')

  await expect.poll(() => existsSync(out), { timeout: 10000 }).toBe(true)
  // PowerShell echo her argümanı ayrı satıra yazar.
  expect(readFileSync(out, 'utf8').split(/\r?\n/).filter(Boolean).join(' ')).toBe('alpha XYZ charlie')
})
