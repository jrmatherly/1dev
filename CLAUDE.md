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

Phase 1 enterprise auth wiring is complete and the login flow is fully wired (see [`docs/enterprise/auth-login-button-wire-msal.md`](docs/enterprise/auth-login-button-wire-msal.md)): `auth-manager.ts` uses a Strangler Fig adapter gated by `enterpriseAuthEnabled` flag (with a dev-only `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` env override), `applyEnterpriseAuth()` injects tokens into the Claude spawn env, the `enterpriseAuth` tRPC router exposes sign-in/out to the renderer, and clicking **Sign in** invokes MSAL `acquireTokenInteractive()` end-to-end. Cluster config is deployed (`onecode_api_enabled: true` in `cluster.yaml`); Settings UI for runtime flag toggles (change #3) is deferred to a future OpenSpec proposal.

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

# Quality gates — 5 CI-enforced + 1 local-only lint advisory (run all 6 before every PR)
bun run ts:check         # CI gate 1 — tsgo (requires: npm install -g @typescript/native-preview)
bun run lint             # LOCAL ONLY — not a CI gate yet; eslint + eslint-plugin-sonarjs (see docs/conventions/quality-gates.md for why)
bun run build            # esbuild packaging validation
bun test                 # bun:test regression guards (~3s)
bun audit                # dependency advisories
cd docs && bun run build # xyd-js docs site build

# AI binary management
bun run claude:download  # Claude CLI binary (pinned 2.1.96)
bun run codex:download   # Codex binary (pinned 0.118.0)
```

Release workflow (GitHub Actions 3-OS matrix build → draft GitHub Release via `release.yml`): [`docs/operations/release.md`](docs/operations/release.md). v0.0.79 was the first successful all-platform build (2026-04-10). v0.0.80 was deleted after Windows postinstall + macOS Codex 403 failures. v0.0.81 ships Cluster A+C TS fixes (54→38), keytar arm64 rebuild, Windows electron-rebuild fix, and a rewritten Codex downloader that skips `api.github.com` entirely (uses pinned SHA256 hashes against direct release-asset URLs). v0.0.82 ships enterprise UI debranding (env-var-driven analytics, Discord→Slack, dynamic editor detection, env-var feedback). v0.0.83 was deleted (container-build Trivy SHA-tag mismatch + transient Windows NSIS 502). v0.0.84 was deleted (superseded by CI-fix stack before .trivyignore landed). **v0.0.85** (published 2026-04-13) ships Phase C §7 claude.ts decomposition (4 new modules, 3309→2503 lines), the archived security-hardening baselines (+18 requirements), and the release-infrastructure fix stack: annotated-tag discipline, container-build Trivy scan-by-digest, Cosign digest-from-build-push-action, `.trivyignore` with CVE-2026-28390 exemption. First-ever full Trivy+Cosign end-to-end success on the container pipeline. Ships unsigned; signing is a follow-on task. **v0.0.86** (tagged 2026-04-14, building) ships Graph `/me` profile + `/me/photo/$value` avatar with `<AvatarWithInitials>` FNV-1a deterministic-hash fallback, cross-platform preferred-editor detection via npm `which`, Account tab refactored (photo + name header, 4 read-only Graph fields), Docker action bumps (buildx/qemu/login v4, build-push v7). Three changes archived: `add-entra-graph-profile` (+2 reqs), `wire-login-button-to-msal` (+8 reqs), `fix-preferred-editor-detection` (+2 reqs) — baselines: 17 specs, 136 requirements.

## Architecture summary

Three-layer Electron app: **main** process (Node.js + tRPC routers), **preload** (IPC bridge), **renderer** (React 19 + Tailwind). State via Jotai + Zustand + React Query. AI backends via `@anthropic-ai/claude-agent-sdk`, Codex CLI, and Ollama.

- **[Codebase layout](docs/architecture/codebase-layout.md)** — full tree of `src/main/`, `src/preload/`, `src/renderer/`
- **[Database (Drizzle + SQLite)](docs/architecture/database.md)** — 7 tables at `{userData}/data/agents.db`, auto-migration
- **[tRPC routers](docs/architecture/trpc-routers.md)** — 23 routers in `createAppRouter` (22 feature routers + 1 git router; `litellmModels` added 2026-04-13 as Group 8 of `add-dual-mode-llm-routing`, archived 2026-04-14)
- **[Tech stack](docs/architecture/tech-stack.md)** — Electron 41 / React 19 / TypeScript 6 / Tailwind 4 / Bun
- **[Upstream boundary](docs/architecture/upstream-boundary.md)** — `remoteTrpc.*` call sites and F-entry coverage

**Key integration files:**
- `src/main/lib/db/schema/index.ts` — Drizzle schema (source of truth)
- `src/main/lib/trpc/routers/index.ts` — `createAppRouter` composition
- `src/main/lib/credential-store.ts` — unified 3-tier credential encryption
- `src/main/lib/safe-external.ts` — scheme-validated `safeOpenExternal()` wrapper (all `shell.openExternal` calls must go through this)
- `src/main/lib/enterprise-auth.ts` — MSAL Node Entra token acquisition (wired into auth-manager via `enterpriseAuthEnabled` flag)
- `src/main/lib/trpc/routers/enterprise-auth.ts` — Enterprise auth tRPC router (signIn/signOut/getStatus/refreshToken)
- `src/renderer/features/agents/main/active-chat.tsx` — main chat component
- `src/renderer/lib/remote-trpc.ts` — upstream tRPC client (F-entry scope)
- `electron.vite.config.ts` — build config (main/preload/renderer entries)

## Working directories

- **`docs/`** — Canonical xyd-js documentation site (6 tabs: Architecture, Enterprise, Conventions, Operations, Code Graph, API Reference). Build: `cd docs && bun run build`. Dev: `bunx xyd` (port 5175). CI runs `docs-build` as a quality gate. The Code Graph tab (`docs/code-graph/`) contains Tree-sitter + Leiden community detection analysis of the codebase (3,797 nodes / 29,438 edges / 406 communities).
- **`.claude/rules/`** — Claude Code behavioral rules (path-scoped). See [`.claude/rules/README.md`](.claude/rules/README.md).
- **`.claude/skills/`** — Claude Code workflow skills (on-demand). Start with **`project-orchestrator`** for ambiguous/multi-step tasks — it runs a hard-rule gate (auth-env-vars, credential-storage, TS baseline, OpenSpec Phase 0 scope, LiteLLM OSS, scratchpad, roadmap, upstream-boundary, database, vite-config) before routing work to the right skill/subagent/MCP.
- **`.claude/agents/`** — Claude Code subagents (task-specific: `db-schema-auditor`, `trpc-router-auditor`, `upstream-dependency-auditor`, `security-reviewer`, `ui-reviewer`, `test-coverage-auditor`, `openspec-task-progress-auditor`, `regression-guard-catalog-auditor`, `litellm-oss-boundary-auditor`).
- **`.serena/memories/`** — Serena project memories. Read via `mcp__serena__read_memory` **after** activating the project with `mcp__serena__activate_project` (project: `ai-coding-cli`).
- **`services/1code-api/`** — Self-hosted backend API (Fastify + tRPC + Drizzle/PostgreSQL). Replaces upstream `1code.dev` AND owns LiteLLM provisioning (`add-1code-api-litellm-provisioning`) — absorbs the Apollos portal's user/team/key lifecycle subset behind a `PROVISIONING_ENABLED` feature flag. Container built via `.github/workflows/container-build.yml` → `ghcr.io/jrmatherly/1code-api`. See [`services/1code-api/README.md`](services/1code-api/README.md) and [`docs/enterprise/1code-api-provisioning.md`](docs/enterprise/1code-api-provisioning.md).
- **`deploy/`** — Kubernetes deployment manifests (Flux v2). Components: `1code-api`, `envoy-auth-policy`. All values use `${PLACEHOLDER}` substitution. See [`deploy/README.md`](deploy/README.md).
- **`openspec/`** — OpenSpec 1.2.0 change proposals and **17 capability specs (136 requirements)**. Active changes (2): `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded as commit `83d0d84` — ShipIT editor/terminal detection pattern for dev launch UX), `upgrade-vite-8-build-stack` (16/50, Phase B blocked on electron-vite 6.0). Recently archived: `wire-login-button-to-msal` on 2026-04-14 (45/57 tasks shipped — MSAL sign-in flow end-to-end, typed AuthError discriminated union, login.html a11y toast, dev-only env-var flag override, completeAuthSuccess shared helper; +8 reqs promoted across brand-identity (+1), enterprise-auth-wiring (+6), feature-flags (+1); §11 manual smokes deferred — happy path verified organically via add-entra-graph-profile dev sessions); `add-entra-graph-profile` on 2026-04-14 (39/45 tasks shipped — Graph `User.Read` delegated scope + `acquireTokenForGraph()` + `/me` profile + `/me/photo/$value` avatar with `<AvatarWithInitials>` FNV-1a fallback + admin-consent docs in `entra-app-registration-1code-api.md` Step 5a/5b; +2 reqs promoted to `enterprise-auth` baseline (5→7); §9 manual smoke verified in dev; Manager field deferred — tenant 403); `fix-preferred-editor-detection` on 2026-04-14 (24/31 tasks shipped — `which`-based cross-platform PATH detection, `AppMeta.cliBinary`, `getOsDefaults` tRPC procedure, `preferredEditorAtom` flipped to `ExternalApp | null` with first-paint resolution, fail-closed filter + loading state + `"No editor selected"` placeholder; +2 reqs promoted to `renderer-data-access` baseline; G7 manual smoke skipped per user); `add-dual-mode-llm-routing` on 2026-04-14 (50/59 tasks shipped; Groups 1-10 + 12 landed — Entra decoupling + dual-mode routing + `litellmModels` tRPC router + Settings UI wizard §9.1-§9.10 + subscription-aware model-picker gate; +1 new baseline `llm-routing` (7 reqs) + modified `claude-code-auth-import` / `credential-storage` / `enterprise-auth`; 9 deferred live-cluster smokes tracked in `docs/operations/roadmap.md`); `remediate-dev-server-findings` on 2026-04-13 (7 commits: `0f43165`, `3b37397`, `96af6c5`, `01d451e`, `8ef644b`, `4bc809c`, `b89d282` — auth hardening, provider-aware aux-AI dispatch at `src/main/lib/aux-ai.ts`, signed-fetch upstream-disabled gate + undici-aware 60s negative cache, legacy Custom Model config bridge, F11/F12 catalog entries, +7 requirements promoted including new `observability-logging` baseline spec); `security-hardening-and-quality-remediation` on 2026-04-13. See [`.claude/rules/openspec.md`](.claude/rules/openspec.md).
- **`tests/regression/`** — 35 bun:test files (34 regression guards + 1 frontmatter shim unit test). **339 tests / 712 expect() calls / ~8s runtime across 55 files including service tests**. Recent additions from `remediate-dev-server-findings` (archived): `aux-ai-provider-dispatch`, `no-apollosai-aux-ai-fetch`, `signed-fetch-cache`, `raw-logger-concurrent-writes`, `no-legacy-oauth-byok-leak`. Plus `litellm-models-router` (from archived `add-dual-mode-llm-routing` Group 8, archived 2026-04-14), `subscription-lock-model-picker` (Group 9.10, added 2026-04-13 alongside the Settings UI wizard), `preferred-editor-reflects-installed` (from archived `fix-preferred-editor-detection`, 2026-04-14), and `graph-profile-404-fallback` + `graph-avatar-data-url-shape` (from active `add-entra-graph-profile`, 2026-04-14 — shape guards for `/me/photo/$value` 404/403 fallback and `<AvatarWithInitials>` FNV-1a determinism). Plus service tests in `services/1code-api/tests/` (242 tests across 41 files total; 232 pass + 10 skipped integration tests behind `INTEGRATION_TEST=1` + docker-compose harness at `services/1code-api/tests/integration/`). See [`docs/conventions/regression-guards.md`](docs/conventions/regression-guards.md).
- **`.scratchpad/`** — Ephemeral local-only notes (gitignored). Never referenced from tracked files.

**Deployment target cluster repo:** `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos K8s, Envoy Gateway, LiteLLM, OIDC stack). Coordinate cross-repo for auth/backend work. See [`docs/operations/cluster-access.md`](docs/operations/cluster-access.md).

## Dev environment quick reference

- **Dev auth bypass:** Set `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env` to skip login in dev mode (only works when `!app.isPackaged`). Required because the upstream OAuth backend is dead and Envoy Gateway auth isn't deployed yet.
- **Entra app-registration scopes:** The desktop app registration requires the `User.Read` delegated Microsoft Graph permission for the Account tab's `/me` profile and avatar (`src/main/lib/graph-profile.ts`). Admin consent is a one-time tenant operation — see [`docs/enterprise/entra-app-registration-1code-api.md` § Step 5a](docs/enterprise/entra-app-registration-1code-api.md#5a-delegated-graph-permissions-for-the-desktop-client). Without consent, users see a per-account prompt on first interactive sign-in.
- **LLM routing env vars** (dual-mode routing, see [`docs/enterprise/llm-routing-patterns.md`](docs/enterprise/llm-routing-patterns.md)):
  - `MAIN_VITE_LITELLM_BASE_URL=https://llms.<cluster>/` — LiteLLM proxy URL, required when any account uses `routingMode="litellm"`. Replaces legacy `LITELLM_PROXY_URL`. Startup preflight warns if a litellm-routed account exists but this is unset.
  - `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true` — Opt-in to direct-to-Anthropic routing (`subscription-direct`, `byok-direct`) in the onboarding wizard. Unset or `false` silently locks the wizard to LiteLLM routing — defense-in-depth against users bypassing proxy rate limits, audit logging, and team allowlists.
- **TS baseline: 0 errors** (reduced from 32 on 2026-04-11 via full sweep across all 10 buckets from `.scratchpad/code-problems/002-analysis.md` — see commit history for the staged approach). Key fixes: desktop routing stub arity, `setDiffStats` `useCallback` typing (`DiffStats | ((prev) => DiffStats)`), `"plugin"` source union widening (`FileMentionOption`, `AgentData`), `UploadedFile.mediaType` addition, null→undefined narrowing for `agentName`/`desktopUser`, removed stale `@ts-expect-error` + obsolete `Selection.getComposedRanges` polyfill (now in `lib.dom.d.ts`), React-19 `useRef` initial value, `app.dock?.setMenu` platform guard, `CodexMcpServerForSettings` widened with optional `serverInfo?`/`error?` to align with Claude's `MCPServer` shape, `DiffSidebarContentProps`/`DiffSidebarRendererProps`/`AgentDiffView` prop-shape unification (flat `repository?: string`, nullable `sandboxId`, nullable `agentChat.prUrl`), `work-mode-selector` runtime narrow against the `sandbox` future-feature branch, `mcp-servers-indicator` tRPC status cast to `MCPServerStatus`. Enforced **both** locally (PostToolUse hook) **and in CI** (`ci.yml` reads `.claude/.tscheck-baseline` and fails if count exceeds it). Only new errors fail gates. See [`.claude/rules/tscheck-baseline.md`](.claude/rules/tscheck-baseline.md).
- **Version pins (load-bearing):** Vite 7.x, Shiki 4.0.2 (upgraded from 3.23.0 on 2026-04-10 via `upgrade-shiki-4` → PR #11; dual-version install with nested `@pierre/diffs/shiki@3.23.0` accepted), Claude CLI 2.1.96, Codex 0.118.0 (SHA256-pinned in `scripts/download-codex-binary.mjs` — skips `api.github.com` entirely), `@xyd-js/cli` `0.0.0-build-1202121-20260121231224`. See [`docs/conventions/pinned-deps.md`](docs/conventions/pinned-deps.md) for why each one is pinned.
- **Lint config:** `eslint.config.mjs` — ESLint 10 flat config with `eslint-plugin-sonarjs` v4. Suppressions document why each rule is off for this Electron/React codebase. Run `bun run lint` for project-wide scan.
- **IDE config:** `.vscode/settings.json` tracked in git — tsgo flag + SonarLint rule suppressions (64 rules disabled project-wide, covering TS/JS/CSS). Note: `sonarlint.rules` has `application` scope — VS Code ignores workspace settings; each dev must copy the block to User settings. See `docs/conventions/quality-gates.md` § "SonarLint IDE vs. `bun run lint`" for the full explanation.
- **Upgrade tool false renames:** `npx @tailwindcss/upgrade` (and similar bulk-rename tools) can't distinguish CSS classes from identically-named strings in non-CSS contexts (VSCode theme keys, dictionary words, event handler args). Always grep for renamed strings in non-CSS files after running upgrade tools.
- **CI release gotchas:** (1) `GITHUB_TOKEN` is repo-scoped — sending it as Bearer to cross-org APIs (e.g., `openai/codex`) returns 403; use per-platform downloads with `GITHUB_TOKEN=""` + retry with backoff. (2) Windows GPG in Git Bash: MSYS2-compiled GPG mangles Windows paths — `download-claude-binary.mjs` `toGpgPath()` converts `C:\...` → `/c/...` (both `--homedir` AND `GNUPGHOME` alone are insufficient; Chocolatey `gpg4win`/`gnupg` installs hang on CI runners). (3) `bun.lock` must be committed after any `package.json` devDependency change or `--frozen-lockfile` CI fails. (4) macOS-15 runners have only 7 GB RAM — `NODE_OPTIONS="--max-old-space-size=6144"` is required on the build step to prevent V8 heap OOM.
- **Gotchas (tool quirks, macOS base64url, Entra v2 manifest, Flux/GitOps):** [`docs/operations/env-gotchas.md`](docs/operations/env-gotchas.md).
- **First-install debug:** clear `~/Library/Application\ Support/Agents\ Dev/`, reset Launch Services. Full runbook in [`docs/operations/debugging-first-install.md`](docs/operations/debugging-first-install.md).

## Shipped features (v0.0.72+)

Multi-backend AI (Claude, Codex, Ollama) · Drizzle ORM with 7 tables + auto-migration · 23 tRPC routers · Integrated terminal (node-pty) · Plugin and skills system · File viewer, kanban, automations · Voice, @-mentions, search · Encrypted credential storage · Enterprise Entra ID auth (MSAL) · Graph profile + avatar (User.Read delegated scope) · Cross-platform preferred-editor detection · Self-hosted LiteLLM provisioning (1code-api + teams.yaml, feature-flagged) · Auto-update with notarization.

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
