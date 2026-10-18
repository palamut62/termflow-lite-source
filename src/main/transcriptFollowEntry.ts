import { followFile } from './transcriptFollow'

// `npm run build:mcp` -> out/mcp/follow-transcript.cjs. Uygulama baslarken userData/mcp altina
// kopyalar; izleme sekmesi ELECTRON_RUN_AS_NODE=1 ile calistirir (bkz. agentTasks.followCommand).
const file = process.argv[2]
if (!file) {
  process.stderr.write('usage: follow-transcript <transcript.jsonl>\n')
  process.exit(2)
}
followFile(file, (text) => process.stdout.write(text))
// Electron exe'si GUI alt sistemi: sekme kapaninca konsolla birlikte olmez, ust kabuk gidince kendimiz cikariz.
setInterval(() => { try { process.kill(process.ppid, 0) } catch { process.exit(0) } }, 2000)
