import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phone client for Remote Access (docs/remote-access.md). Served by the main
// process from out/remote over the Tailscale address.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  root: resolve(__dirname, 'src/remote'),
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/remote'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    // Stable names: an iPhone home-screen app may start from an old cached
    // index.html, which must still find its scripts after an update. The
    // server revalidates every file (ETag), so stable names never go stale.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
