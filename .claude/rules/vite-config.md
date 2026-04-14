---
paths:
  - "electron.vite.config.ts"
  - "openspec/changes/upgrade-vite*/**"
---

# Vite / electron-vite upgrade verification playbook

This repo uses **electron-vite** to wrap Vite's config with main/preload/renderer sections. Main and preload emit CJS; renderer emits ESM. Vite or electron-vite upgrades carry non-obvious CJS output risks — use this playbook to verify safely without a full functional test pass.

## Static verification (post-upgrade, pre-runtime)

After `bun install` and `bun run build`, run these checks against the built bundles:

### 1. `externalizeDeps.exclude` modules are bundled (not require()'d)

The config has `externalizeDeps.exclude` listing modules that must be bundled into main/preload instead of treated as runtime `require()` targets. Verify none of them appear as `require("<name>")` in the output:

```bash
# Want 0 — these should be bundled, not external
grep -cE 'require\("(superjson|trpc-electron|front-matter|async-mutex)"\)' out/main/index.js

# Spot-check distinctive internal symbols (these prove they're bundled):
grep -c "SuperJSON\|superjson_parse"                          out/main/index.js  # superjson
grep -c "Mutex\|semaphore\|waitUnlock\|acquireQueue"          out/main/index.js  # async-mutex
grep -c "bodyBegin\|parseFrontMatter"                         out/main/index.js  # front-matter
grep -c "electronTRPC"                                        out/preload/index.js  # trpc-electron
```

### 2. ESM-only deps must stay as dynamic `import(...)`, not `require(...)`

`@anthropic-ai/claude-agent-sdk` is ESM-only. If Vite/Rolldown converts its dynamic `await import()` to `require()`, the main process will throw `ERR_REQUIRE_ESM` at first use. Verify:

```bash
# Want: import("@anthropic-ai/claude-agent-sdk") present, require("@anthropic-ai/claude-agent-sdk") absent
grep -oE 'import\("@anthropic-ai/claude-agent-sdk"\)|require\("@anthropic-ai/claude-agent-sdk"\)' out/main/index.js
```

Same check applies to `node-pty` (native bindings — must stay lazy via dynamic import).

### 3. `import.meta.env` replacement works in all 3 processes

Vite replaces `import.meta.env.*` at build time. Unreplaced references mean the pipeline broke:

```bash
grep -c "import\.meta\.env" out/main/index.js out/preload/index.js out/renderer/assets/index-*.js
# Want: 0 in all three
```

Also spot-check that `MAIN_VITE_*` prefixed vars inlined correctly — no `MAIN_VITE_*` literal identifiers should survive in main bundle.

### 4. Single React instance (renderer)

plugin-react v5+ no longer auto-configures `resolve.dedupe: ['react', 'react-dom']`. Verify exactly one React version is resolved:

```bash
bun pm ls 2>&1 | grep -E "react@|react-dom@"
# Want: exactly one react@<X> and one react-dom@<X>
```

## Runtime verification signals (from `bun run dev` logs)

When the user runs `bun run dev` and clicks through the app, look for these positive signals in the stdout dump:

| Signal | What it proves |
|---|---|
| `vite v<X> building ssr environment` | Vite version resolved correctly |
| `electron main process built successfully` (in ms) | main CJS build OK |
| `electron preload scripts built successfully` | preload CJS build OK |
| `dev server running for the electron renderer process at: http://localhost:5173/` | renderer ESM dev server bound |
| `[Main] Window 1 ready to show` + `Page finished loading` | renderer rendered cleanly |
| `[DB] Running migrations` + `Migrations completed` | Drizzle auto-migration OK |
| `[claude] SDK initialization took Xs` | ESM-only claude-agent-sdk dynamic import succeeded (CRITICAL) |
| `[SD] M:END sub=... reason=ok n=<N>` | Full streaming agent session worked end-to-end |

## Known non-regressions (ignore these in dev logs)

- `apollosai.dev/api/changelog` 404s → dead upstream SaaS (F-entry restoration pending)
- `localhost:3000/api/trpc/teams.getUserTeams` 404s → same
- `mcp-server-kubernetes` ENOENT `/Users/jason/talos-vmware/kubeconfig` → user-specific MCP config
- `Error: No handler registered for 'update:get-channel'` → known `upgrade-electron-41` auto-updater task pending
- `[agents] Failed to parse markdown: YAMLException` → skill-file content bug, not Vite-related

## Phased upgrade flow

`upgrade-vite-8-build-stack` is a **phased change**: Phase A (Vite 7 stepping stone) lands first, Phase B (Vite 8 + Rolldown + electron-vite 6.0 + Shiki 4) waits on upstream blockers. When Phase A completes, **do NOT archive the change** — it stays active so Phase B can pick up when unblocked.

## Related canonical doc

- `openspec/changes/upgrade-vite-8-build-stack/proposal.md` — full upgrade proposal
- `docs/operations/roadmap.md` — upgrade execution order
- `.claude/rules/openspec.md` — phased change archive rule
