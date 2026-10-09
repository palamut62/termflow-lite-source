import { execFileSync } from 'child_process'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// The release is built by CI from git, so a phone asset that git ignores
// (the repo ignores *.png) works locally and is missing in the installed app.
const publicDir = join(__dirname, '..', 'public')

function ignored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('phone client assets', () => {
  it('none of public/ is ignored by git', () => {
    for (const name of readdirSync(publicDir)) expect(ignored(join(publicDir, name)), name).toBe(false)
  })

  it('every asset index.html and the manifest point to exists', () => {
    const files = new Set(readdirSync(publicDir))
    const html = readFileSync(join(publicDir, '..', 'index.html'), 'utf-8')
    const manifest = readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf-8')
    const refs = [...html.matchAll(/href="\/([^"]+)"/g), ...manifest.matchAll(/"src": "\/([^"]+)"/g)].map((m) => m[1])
    expect(refs.length).toBeGreaterThan(2)
    for (const ref of refs) expect(files.has(ref), ref).toBe(true)
  })
})
