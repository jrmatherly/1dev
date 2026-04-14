---
title: tRPC Routers
icon: route
---

# tRPC Routers {subtitle="23 routers composed in createAppRouter"}

The Electron **main process** exposes functionality to the **renderer** via tRPC over IPC (`trpc-electron`). Every feature that crosses the process boundary — database queries, subprocess spawning, file I/O, OS integration — goes through a typed tRPC procedure.

Composition happens in [`src/main/lib/trpc/routers/index.ts`](https://github.com/jrmatherly/1dev/blob/main/src/main/lib/trpc/routers/index.ts) via `createAppRouter`, which mounts **22 feature routers + 1 git router** (the git router is created via a factory `createGitRouter()` so it can be instantiated with config).

## Router inventory

| Router | File | Purpose |
|--------|------|---------|
| `projects` | `routers/projects.ts` | Register / list local project folders |
| `chats` | `routers/chats.ts` | Top-level chat session CRUD |
| `claude` | `routers/claude.ts` | Claude Agent SDK session spawn + stream (largest router, ~3,298 lines) |
| `claudeCode` | `routers/claude-code.ts` | Claude CLI OAuth + version + binary-download integration |
| `claudeSettings` | `routers/claude-settings.ts` | Model + system-prompt persistence |
| `anthropicAccounts` | `routers/anthropic-accounts.ts` | Multi-account credential management |
| `ollama` | `routers/ollama.ts` | Local Ollama model discovery + pull |
| `codex` | `routers/codex.ts` | Codex CLI ACP bridge via `@zed-industries/codex-acp` |
| `terminal` | `routers/terminal.ts` | `node-pty` terminal sessions (lazy-loaded native module) |
| `external` | `routers/external.ts` | Shell open-in-finder / open-in-editor / `safeOpenExternal()` |
| `files` | `routers/files.ts` | File viewer / read / write within project folders |
| `debug` | `routers/debug.ts` | Developer debug panel (userData path, log tail) |
| `skills` | `routers/skills.ts` | Claude Code skill discovery from `.claude/skills/` |
| `agents` | `routers/agents.ts` | Agent frontmatter parsing + list (via canonical `frontmatter.ts` shim) |
| `worktreeConfig` | `routers/worktree-config.ts` | Git worktree preferences |
| `sandboxImport` | `routers/sandbox-import.ts` | Import sandbox chat history |
| `commands` | `routers/commands.ts` | Claude Code slash-command discovery |
| `voice` | `routers/voice.ts` | Voice-to-text (native dictation bridge) |
| `plugins` | `routers/plugins.ts` | Claude Code plugin discovery |
| `featureFlags` | `routers/feature-flags.ts` | Read/write feature flags (DB-backed with in-memory cache) |
| `enterpriseAuth` | `routers/enterprise-auth.ts` | MSAL Entra ID sign-in / sign-out / refresh |
| `litellmModels` | `routers/litellm-models.ts` | Query LiteLLM proxy `/v1/models` with a virtual key (BYOK-LiteLLM onboarding wizard auto-populate, Group 8 of `add-dual-mode-llm-routing`) |
| `changes` | (via `createGitRouter()`) | Git diff / status / commit / branch / log (11 files in `src/main/lib/git/`) |

**23 routers total.** The count is enforced by the `trpc-router-auditor` subagent and the `docs-drift-check` skill.

## Router conventions

- **One file per router** under `src/main/lib/trpc/routers/`
- **Named export** matching the mount key: `export const projectsRouter = router({ ... })`
- **Public vs. protected procedures** — `publicProcedure` for operations that don't need auth, `authedProcedure` (Phase C §8.3) for credential-sensitive operations
- **Helpers are separate** — `agent-utils.ts` is a helper module, not a router (verified by `trpc-router-auditor`)

## Adding a new router

Use the manual-only skill:

```
/new-router
```

It scaffolds the file, adds the import + mount line in `index.ts`, and reminds you to update `docs/architecture/trpc-routers.md` (this page) and run the `trpc-router-auditor` subagent.

## Renderer consumption

The renderer uses `createTRPCReact<AppRouter>()` from `@trpc/react-query`. The single provider lives at `src/renderer/contexts/TRPCProvider.tsx`. React Query handles caching, refetching, and optimistic updates for all tRPC calls.

**Local tRPC** (this document's scope) goes over IPC via `trpc-electron`.

**Remote tRPC** (upstream `apollosai.dev` / `1code.dev` SaaS surface) goes over HTTPS via `remoteTrpc` — see [Upstream Backend Boundary](./upstream-boundary.md) for the F-entry catalog.

## Drift guarantees

The **`trpc-router-auditor`** subagent (`.claude/agents/trpc-router-auditor.md`) verifies:

- The router count in this document matches `createAppRouter` composition
- Each listed router file exists and exports the expected name
- `agent-utils.ts` is NOT counted as a router
- CLAUDE.md and Serena memory counts agree

## Related

- [Database](./database.md) — routers consume the Drizzle schema
- [Upstream Backend Boundary](./upstream-boundary.md) — remote tRPC vs. local tRPC
- [Codebase Layout](./codebase-layout.md) — where routers live in the `src/` tree
