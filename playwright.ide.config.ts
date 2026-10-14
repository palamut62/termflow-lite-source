import { defineConfig } from '@playwright/test'

/** Agent IDE E2E: `npm run test:e2e:ide` once TERMFLOW_EDITION=ide ile derler. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/ide-*.spec.ts'],
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: { trace: 'off' }
})
