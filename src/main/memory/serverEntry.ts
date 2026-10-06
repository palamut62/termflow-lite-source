import { MemoryMcpServer, serveStdio } from './mcpServer'

// `npm run build:mcp` -> out/mcp/memory-server.cjs. Uygulama başlarken bu dosyayı
// userData/mcp altına kopyalar; ajanlar oradan ELECTRON_RUN_AS_NODE=1 ile başlatır.
const flag = process.argv.indexOf('--memory-dir')
const dir = flag >= 0 ? process.argv[flag + 1] : undefined
if (!dir) {
  process.stderr.write('usage: memory-server --memory-dir <dir>\n')
  process.exit(2)
}
serveStdio(new MemoryMcpServer(dir))
