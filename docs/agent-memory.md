# Agent Memory (spec)

Status: implemented 2026-10-06 (unreleased). Code: `src/main/memory/`, IPC `src/main/ipc/memory.ts`, UI `src/renderer/src/settings/MemorySettings.tsx`.

## Goal

Every TermFlow Lite user gets a rolling 30-day memory of their agent work
(Claude Code, Codex, OpenCode): per project, what was done, what is half
finished, what is broken, which decisions were made. Any agent running on the
machine can read it through a bundled MCP server, so a new session starts where
the last one stopped instead of re-discovering the project.

Memory is strictly per user and per machine: it lives in that user's
`<userData>/memory/`, built from that user's own sessions with that user's own
OpenRouter key. The MCP server is a local process each installation starts for
itself; there is no TermFlow backend and nothing is shared between users.

## Non-goals

- No files written into the user's projects (no `memory.md` in repos).
- No raw transcripts sent anywhere. Only a locally condensed digest leaves the machine.
- No memory older than 30 days. No cloud sync.
- Gemini CLI: later, same extractor interface.

## Pipeline

```
sessions (last 30 days)
  ~/.claude/projects/**/*.jsonl, ~/.codex/sessions/**/*.jsonl, `opencode export`
      |
  1. extract   local, no AI      -> SessionDigest      (src/main/memory/extract.ts)
  2. summarize OpenRouter, JSON   -> SessionSummary     (cached by id + mtime + size)
  3. merge     OpenRouter, md     -> memory/projects/<key>.md
  4. serve     MCP server (stdio) -> agents
```

### 1. Extract (pure, unit tested)

Reuses discovery from `src/main/agentSessions.ts`. Per session keeps only:

- user messages (each capped) and the last assistant messages
- files touched: Claude `Edit`/`Write`/`MultiEdit` `file_path`, Codex `apply_patch` paths
- shell commands run (first 200 chars), with `git commit` messages kept in full
- **last todo list**: Claude `TodoWrite` input, Codex `update_plan` steps, with their
  `pending | in_progress | completed` status. This is the deterministic source for
  "where did it stop"; the model does not have to guess it.
- errors (non-zero exit, tool errors), deduplicated

Dropped: tool results (file contents, command output, MCP results, including
this memory's own output, which prevents a feedback loop), images, thinking.
Then `redactApiKeys`, then hard cap ~10k chars per digest.

### 2. Summarize

One OpenRouter call per new or changed session, `response_format: json_schema`:

```ts
interface SessionSummary {
  sessionId: string; agent: AgentKind; projectKey: string
  startedAt: number; updatedAt: number
  goal: string
  done: string[]; unfinished: string[]; problems: string[]
  decisions: string[]; files: string[]; lastState: string
}
```

Cached in `memory/sessions/<agent>-<id>.json` with the source `mtime` + `size`.
Sessions modified in the last 10 minutes are skipped (still live).

### 3. Merge

Project key = git root of the session `cwd` (normalized, lowercase on Windows),
falling back to `cwd`. All summaries of a project, oldest first, go into one
call that writes `memory/projects/<slug>.md`:

```
---
project: C:\Users\me\projects\foo
generatedAt: 2026-10-06T12:00:00Z
sessions: 7
lastSessionAt: 2026-10-06T11:20:00Z
---
## Status        (1-3 lines)
## Unfinished    (only items NOT finished by a later session)
## Open problems
## Done          (dated, newest first, compressed)
## Decisions
```

Cap ~4k chars. `memory/index.md` lists projects with last activity and one-line status.

### Retention

Every run: delete session summaries with `updatedAt < now - 30d`, regenerate
affected projects, delete project files with no sessions left. Memory size is
bounded by 30 days of activity, never grows beyond that.

### When it runs ("only when needed")

- App start, then every 30 min while the app is open: a cheap `stat` pass over
  session files. No change -> no API call.
- Manual "Update now" in the Memory panel.
- Only changed projects are re-merged.
- Per-run limits: max sessions, max input chars; the panel shows token usage.

## MCP server

- Bundled script `out/mcp/memory-server.js` (esbuild, `@modelcontextprotocol/sdk`
  bundled in), listed in `asarUnpack`.
- Launched with the app's own binary, so users do not need Node:
  `"<TermFlow Lite.exe>" "<userData>/mcp/memory-server.cjs" --memory-dir "<userData>/memory"`
  (Linux AppImage: `$APPIMAGE` instead of the mounted executable)
  with `ELECTRON_RUN_AS_NODE=1`.
- Read-only. No API key, no network. Works while TermFlow is closed.
- Server `instructions`: "At the start of a session call `get_project_memory`
  with the current working directory."
- Tools:
  - `get_project_memory(cwd)` -> project md (resolves git root), with a header
    saying when it was generated and that later work is not included
  - `list_projects()` -> `index.md`
  - `search_memory(query)` -> matching lines across project files

### Connecting agents (opt-in, Settings > Memory)

| Agent | How |
| --- | --- |
| Claude Code | `claude mcp add --scope user termflow-memory -e ELECTRON_RUN_AS_NODE=1 -- <exe> <script> --memory-dir <dir>` |
| Codex | `codex mcp add termflow-memory --env ELECTRON_RUN_AS_NODE=1 -- <exe> <script> --memory-dir <dir>` |
| OpenCode | no non-interactive CLI: back up `opencode.json`, add `mcp.termflow-memory` `{ type: "local", command: [...], environment: {...} }` |

Each row shows connected / not installed / path outdated, with Connect and
Disconnect. On start, if the registered exe path differs from the current one
(AppImage moved, install dir changed), the row shows "Repair".

## Settings and secrets

- `settings.memory`: `{ enabled: false, model: string, excludedProjects: string[] }`
- OpenRouter key in `ProviderSecretStore` under id `openrouter`.
- API calls from the main process (renderer CSP blocks external hosts).
- Default model `deepseek/deepseek-v4-flash` (cheap, 1M context, structured
  output); any OpenRouter model id can be set. `reasoning.effort: low`, answers
  cut at `max_tokens` lose their partial last line. Cost is read from `usage.cost`.
- Limits: 40 sessions per run, 3 requests in parallel, digest ~10k chars,
  merge input 60k chars, project file ~4k chars. 401/402/404 stop the run.

## Privacy

- Off by default. Enabling shows an in-app modal: what is sent (condensed
  digests, redacted), where (OpenRouter + chosen model's provider), how to exclude a project.
- Excluded projects are never extracted or sent; their memory is deleted.
- "Clear memory" removes the whole `memory/` folder.

## UI

Settings > Memory (not a separate panel): enable toggle with an inline consent
box, OpenRouter key, model, status with Update now and token/cost of the last
run, agent connections, project list with preview and Exclude, excluded list,
Delete all memory (click twice). Feedback via `toastStore`, no native dialogs.

## Implementation slices (all done)

1. `extract.ts` + tests on real fixture transcripts (Claude, Codex, OpenCode)
2. `store.ts`: layout, project key, cache, retention + tests
3. `openrouter.ts` client + `summarize.ts` / `merge.ts` prompts + tests with mocked fetch
4. Orchestrator, IPC, settings, secret
5. MCP server bundle + tests (spawn, call tools over stdio)
6. Connect agents UI (Claude, Codex, OpenCode)
7. Memory panel UI
8. `npm run verify`, e2e smoke, CHANGELOG, README/site feature line
