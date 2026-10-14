// Agent IDE surumu icin herhangi bir npm betigini calistirir: `node scripts/ide.mjs build`.
// TERMFLOW_EDITION=ide -> electron.vite.config.ts define + electron-builder.cjs kimligi.
import { spawnSync } from 'node:child_process'

const [script, ...rest] = process.argv.slice(2)
if (!script) {
  console.error('usage: node scripts/ide.mjs <npm-script> [args]')
  process.exit(2)
}
const result = spawnSync('npm', ['run', script, ...(rest.length ? ['--', ...rest] : [])], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, TERMFLOW_EDITION: 'ide' }
})
process.exit(result.status ?? 1)
