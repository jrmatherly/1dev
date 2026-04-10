# CLAUDE.md — 1Code Enterprise Fork

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Identity

**1Code** (by apollosai.dev) — a local-first Electron desktop app for parallel AI-assisted development. Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution.

**Fork posture:** This is the **enterprise fork** of upstream 1Code, being decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway). **Restoration theme (locked 2026-04-08):** anything the upstream SaaS was providing will be reverse-engineered, re-created, and self-hosted — "drop the feature" and "use someone else's hosted service" are both off the table.

Canonical references:
- [Fork posture + restoration theme](docs/enterprise/fork-posture.md)
- [Upstream feature catalog (F1-F10)](docs/enterprise/upstream-features.md)
- [Auth strategy v2.1 (chosen)](docs/enterprise/auth-strategy.md) — Envoy Gateway dual-auth, empirically validated 2026-04-08
- [Auth fallback v5](docs/enterprise/auth-fallback.md) — MSAL-in-Electron

## Critical rules (load-bearing)

These are the rules most likely to cause incidents if violated. Detailed rules live in [`.claude/rules/`](.claude/rules/) and load automatically when you work on matching files.

1. **HARD RULE — auth env vars:** Never manually set `ANTHROPIC_AUTH_TOKEN` — use `applyEnterpriseAuth()` in `env.ts` which acquires a fresh token and sets it after the `STRIPPED_ENV_KEYS` pass. Read [`.claude/rules/auth-env-vars.md`](.claude/rules/auth-env-vars.md) **before** touching any auth code.
2. **All credential encryption through `credential-store.ts`** — no direct `safeStorage.*` calls elsewhere. Enforced by `tests/regression/credential-storage-tier.test.ts`. See [`.claude/rules/credential-storage.md`](.claude/rules/credential-storage.md).
3. **TDD red-state rule:** A test that fails with `ReferenceError`/`TypeError`/`Cannot find module` is NOT a valid red — fix the harness first. See [`.claude/rules/testing.md`](.claude/rules/testing.md).
4. **Phase 0 gate scope rule:** Gate text in `docs/enterprise/auth-strategy.md` §6 is **exact scope**, not a minimum. Additional work needs its own OpenSpec proposal. See [`.claude/rules/openspec.md`](.claude/rules/openspec.md).
5. **Documentation:** `docs/` is the canonical home. CLAUDE.md, README, memories link to docs — they do NOT duplicate content. Enforced by `openspec/specs/documentation-site/spec.md`.
6. **Never reference `.scratchpad/`** from tracked files. See [`.claude/rules/scratchpad.md`](.claude/rules/scratchpad.md).
7. **Deferred work goes in the roadmap:** [`docs/operations/roadmap.md`](docs/operations/roadmap.md) is the single source of truth for outstanding work. See [`.claude/rules/roadmap.md`](.claude/rules/roadmap.md).

## Phase 0 progress: 15/15 hard gates complete ✅

Canonical status: [`docs/enterprise/phase-0-gates.md`](docs/enterprise/phase-0-gates.md).

Phase 1 enterprise auth wiring is complete: `auth-manager.ts` uses a Strangler Fig adapter gated by `enterpriseAuthEnabled` flag, `applyEnterpriseAuth()` injects tokens into the Claude spawn env, and the `enterpriseAuth` tRPC router exposes sign-in/out to the renderer. Settings UI (change #3) and cluster config (change #4) are deferred to future OpenSpec proposals.

## Commands

```bash
# Development
bun run dev              # Start Electron with hot reload

# Build & package
bun run build            # Compile app
bun run package          # Package for current platform (dir)
bun run package:mac      # DMG + ZIP
bun run package:win      # NSIS + portable
bun run package:linux    # AppImage + DEB

# Database (Drizzle + SQLite)
bun run db:generate      # Generate migrations from schema
bun run db:push          # Push schema directly (dev only)
bun run db:studio        # Open Drizzle Studio GUI

# Quality gates (run all 6 before every PR — none is a superset)
bun run ts:check         # tsgo (requires: npm install -g @typescript/native-preview)
bun run lint             # eslint + eslint-plugin-sonarjs (project-wide code quality)
bun run build            # esbuild packaging validation
bun test                 # bun:test regression guards (~3s)
bun audit                # dependency advisories
cd docs && bun run build # xyd-js docs site build

# AI binary management
bun run claude:download  # Claude CLI binary (pinned 2.1.96)
bun run codex:download   # Codex binary (pinned 0.118.0)
```

Release workflow (GitHub Actions 3-OS matrix build → draft GitHub Release via `release.yml`): [`docs/operations/release.md`](docs/operations/release.md). v0.0.79 first successful all-platform build (2026-04-10). Ships unsigned; signing is a follow-on task.

## Architecture summary

Three-layer Electron app: **main** process (Node.js + tRPC routers), **preload** (IPC bridge), **renderer** (React 19 + Tailwind). State via Jotai + Zustand + React Query. AI backends via `@anthropic-ai/claude-agent-sdk`, Codex CLI, and Ollama.

- **[Codebase layout](docs/architecture/codebase-layout.md)** — full tree of `src/main/`, `src/preload/`, `src/renderer/`
- **[Database (Drizzle + SQLite)](docs/architecture/database.md)** — 7 tables at `{userData}/data/agents.db`, auto-migration
- **[tRPC routers](docs/architecture/trpc-routers.md)** — 22 routers in `createAppRouter` (21 feature routers + 1 git router)
- **[Tech stack](docs/architecture/tech-stack.md)** — Electron 41 / React 19 / TypeScript 6 / Tailwind 4 / Bun
- **[Upstream boundary](docs/architecture/upstream-boundary.md)** — `remoteTrpc.*` call sites and F-entry coverage

**Key integration files:**
- `src/main/lib/db/schema/index.ts` — Drizzle schema (source of truth)
- `src/main/lib/trpc/routers/index.ts` — `createAppRouter` composition
- `src/main/lib/credential-store.ts` — unified 3-tier credential encryption
- `src/main/lib/enterprise-auth.ts` — MSAL Node Entra token acquisition (wired into auth-manager via `enterpriseAuthEnabled` flag)
- `src/main/lib/trpc/routers/enterprise-auth.ts` — Enterprise auth tRPC router (signIn/signOut/getStatus/refreshToken)
- `src/renderer/features/agents/main/active-chat.tsx` — main chat component
- `src/renderer/lib/remote-trpc.ts` — upstream tRPC client (F-entry scope)
- `electron.vite.config.ts` — build config (main/preload/renderer entries)

## Working directories

- **`docs/`** — Canonical xyd-js documentation site. Build: `cd docs && bun run build`. Dev: `bunx xyd` (port 5175). CI runs `docs-build` as a quality gate.
- **`.claude/rules/`** — Claude Code behavioral rules (path-scoped). See [`.claude/rules/README.md`](.claude/rules/README.md).
- **`.claude/skills/`** — Claude Code workflow skills (on-demand).
- **`.claude/agents/`** — Claude Code subagents (task-specific: `db-schema-auditor`, `trpc-router-auditor`, `upstream-dependency-auditor`, `security-reviewer`, `ui-reviewer`).
- **`.serena/memories/`** — Serena project memories. Read via `mcp__serena__read_memory` **after** activating the project with `mcp__serena__activate_project` (project: `ai-coding-cli`).
- **`deploy/`** — Kubernetes deployment manifests (Flux v2). Components: `1code-api`, `envoy-auth-policy`. All values use `${PLACEHOLDER}` substitution. See [`deploy/README.md`](deploy/README.md).
- **`openspec/`** — OpenSpec 1.2.0 change proposals and 9 capability specs (45 requirements). See [`.claude/rules/openspec.md`](.claude/rules/openspec.md).
- **`tests/regression/`** — 14 bun:test regression guards (58 tests). See [`docs/conventions/regression-guards.md`](docs/conventions/regression-guards.md).
- **`.scratchpad/`** — Ephemeral local-only notes (gitignored). Never referenced from tracked files.

**Deployment target cluster repo:** `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos K8s, Envoy Gateway, LiteLLM, OIDC stack). Coordinate cross-repo for auth/backend work. See [`docs/operations/cluster-access.md`](docs/operations/cluster-access.md).

## Dev environment quick reference

- **Dev auth bypass:** Set `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env` to skip login in dev mode (only works when `!app.isPackaged`). Required because the upstream OAuth backend is dead and Envoy Gateway auth isn't deployed yet.
- **TS baseline:** 80 pre-existing errors, enforced **both** locally (PostToolUse hook) **and in CI** (`ci.yml` reads `.claude/.tscheck-baseline` and fails if count exceeds it). Only new errors fail gates. See [`.claude/rules/tscheck-baseline.md`](.claude/rules/tscheck-baseline.md).
- **Version pins (load-bearing):** Vite 7.x, Shiki 3.x, Claude CLI 2.1.96, Codex 0.118.0, `@xyd-js/cli` `0.0.0-build-1202121-20260121231224`. See [`docs/conventions/pinned-deps.md`](docs/conventions/pinned-deps.md) for why each one is pinned.
- **Lint config:** `eslint.config.mjs` — ESLint 10 flat config with `eslint-plugin-sonarjs` v4. Suppressions document why each rule is off for this Electron/React codebase. Run `bun run lint` for project-wide scan.
- **IDE config:** `.vscode/settings.json` tracked in git — tsgo flag + SonarLint rule suppressions (16 rules disabled project-wide, covering TS/JS/CSS). See file for rationale per rule.
- **Upgrade tool false renames:** `npx @tailwindcss/upgrade` (and similar bulk-rename tools) can't distinguish CSS classes from identically-named strings in non-CSS contexts (VSCode theme keys, dictionary words, event handler args). Always grep for renamed strings in non-CSS files after running upgrade tools.
- **CI release gotchas:** (1) `GITHUB_TOKEN` is repo-scoped — sending it as Bearer to cross-org APIs (e.g., `openai/codex`) returns 403; use per-platform downloads with `GITHUB_TOKEN=""` + retry with backoff. (2) Windows GPG in Git Bash: MSYS2-compiled GPG mangles Windows paths — `download-claude-binary.mjs` `toGpgPath()` converts `C:\...` → `/c/...` (both `--homedir` AND `GNUPGHOME` alone are insufficient; Chocolatey `gpg4win`/`gnupg` installs hang on CI runners). (3) `bun.lock` must be committed after any `package.json` devDependency change or `--frozen-lockfile` CI fails. (4) macOS-15 runners have only 7 GB RAM — `NODE_OPTIONS="--max-old-space-size=6144"` is required on the build step to prevent V8 heap OOM.
- **Gotchas (tool quirks, macOS base64url, Entra v2 manifest, Flux/GitOps):** [`docs/operations/env-gotchas.md`](docs/operations/env-gotchas.md).
- **First-install debug:** clear `~/Library/Application\ Support/Agents\ Dev/`, reset Launch Services. Full runbook in [`docs/operations/debugging-first-install.md`](docs/operations/debugging-first-install.md).

## Shipped features (v0.0.72+)

Multi-backend AI (Claude, Codex, Ollama) · Drizzle ORM with 7 tables + auto-migration · 22 tRPC routers · Integrated terminal (node-pty) · Plugin and skills system · File viewer, kanban, automations · Voice, @-mentions, search · Encrypted credential storage · Enterprise Entra ID auth (MSAL) · Auto-update with notarization.

## Documentation maintenance

The authoritative repo navigation map is `.claude/PROJECT_INDEX.md`. Keep the following in sync: this file, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.serena/memories/*`, `.claude/PROJECT_INDEX.md`, and the canonical pages under `docs/`.

Run the `docs-drift-check` skill (`/docs-drift-check`) after:
- Schema changes (`src/main/lib/db/schema/`)
- tRPC router add/remove
- Version pin bumps
- Substantive edits to any documentation surface

Drift points and checks are catalogued in the `docs-drift-check` skill itself (`.claude/skills/docs-drift-check/SKILL.md`).

## Related rules

See [`.claude/rules/README.md`](.claude/rules/README.md) for the full rule index. Path-scoped rules only load when Claude works on matching files, so this file stays focused on identity and global critical rules.
