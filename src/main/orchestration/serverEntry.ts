import { serveStdio } from '../memory/mcpServer'
import { AgentsMcpServer, httpClient } from './mcpServer'

// `npm run build:mcp` -> out/mcp/agents-server.cjs. Uygulama bunu userData/mcp altina kopyalar; ajanlar
// oradan ELECTRON_RUN_AS_NODE=1 ile baslatir. Endpoint dosyasi Agent IDE'nin yerel API adresini tasir.
const flag = process.argv.indexOf('--endpoint-file')
const file = flag >= 0 ? process.argv[flag + 1] : undefined
if (!file) {
  process.stderr.write('usage: agents-server --endpoint-file <file>\n')
  process.exit(2)
}
serveStdio(new AgentsMcpServer(httpClient(file)))
