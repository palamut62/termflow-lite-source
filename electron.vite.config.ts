import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Read the version once at build time so the in-app About stays in sync with
// package.json automatically on every release — no manual duplication.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }
// Ayni kaynaktan iki urun: TermFlow Lite (varsayilan) ve TermFlow Agent IDE (TERMFLOW_EDITION=ide).
const edition = JSON.stringify(process.env.TERMFLOW_EDITION === 'ide' ? 'ide' : 'lite')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __TERMFLOW_EDITION__: edition },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: { __TERMFLOW_EDITION__: edition },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __TERMFLOW_EDITION__: edition
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
