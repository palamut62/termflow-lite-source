# TermFlow Agent IDE - Changelog

## 1.25.0 - 2026-10-15

First release. TermFlow Agent IDE is the TermFlow terminal with a workspace around your coding agents (Claude Code, Codex, OpenCode and the other agent CLIs TermFlow finds). It installs next to TermFlow Lite and keeps its own settings. Ctrl+Shift+I switches between the IDE layout and the plain terminal layout without restarting anything.

- Projects sidebar: every project with its git worktrees and the agent sessions running in each, live state (working, needs input, done), pin, sleep, notes, status and parent worktrees. Group by project, status or pull request, or open the Workspace board.
- Create worktree from a branch name, `#123`, or a pull request or issue link, pick the agent, and optionally a sparse checkout.
- Right panel: Explorer with file content search, Agents (past sessions by project), Source Control (stage, commit, push or publish, create a pull request) and Checks for the branch's pull request.
- Review changes: a diff of the worktree (unified or side by side) against HEAD or any branch, comments on lines, and Send to agent pastes all comments into the agent's prompt as one message without pressing Enter.
- Worktree notes in Markdown, stored with TermFlow, never in the project.
- Pages: Tasks (GitHub issues and pull requests, start a worktree from a row), Automations, Artifacts, Mobile (phone remote access), full page Settings with Stats & Usage.
- Floating workspace with a note and its own terminal, dockable back to the tabs.
- Status bar: keep the computer awake while agents work, a resource manager for terminals, and open ports.
- Search palette (Ctrl+Shift+J): tabs, worktrees, sessions, settings and actions, Tab filters by source.
