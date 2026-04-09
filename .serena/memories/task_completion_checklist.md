# Task Completion Checklist

When a task is completed, run through these steps:

## Required — All Four Quality Gates
1. **Type check**: `bun run ts:check` — Stricter, tsgo-based. Catches type errors esbuild masks.
   - Current baseline: **88** pre-existing errors (stored in `.claude/.tscheck-baseline`). Only fail if count increases.
   - PostToolUse hook tracks drift on every TS edit and emits ❌/✅ status.
   - To distinguish your errors from baseline: `git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop`
2. **Dev build**: `bun run build` — Validates the electron-vite packaging pipeline produces a working artifact
3. **Regression tests**: `bun test` — 6 guards (14 tests) under `tests/regression/` (~200ms total)
4. **Dependency audit**: `bun audit` — Known vulnerability scan
- **None of these is a superset of the others.** All four are required before submitting a PR.
- All four together run in under 2 minutes on an M-series Mac.
- CI (`.github/workflows/ci.yml`) enforces the same four on every PR to main.
- Aligned wording across CLAUDE.md, CONTRIBUTING.md, AGENTS.md, README.md as of 2026-04-08.

## If Schema Changed
3. **Generate migration**: `bun run db:generate` — Create migration from schema changes
4. Verify migration file in `drizzle/` directory

## If New tRPC Router Added
5. Register in `src/main/lib/trpc/routers/index.ts` (`createAppRouter` composition root)
6. Type check confirms `AppRouter` type updates automatically

## If New Upstream-Backend Dependency Added
7. **Flag in `.scratchpad/upstream-features-inventory.md`** with code location, priority, and restore strategy
8. Update CLAUDE.md "Upstream Backend Boundary" section if introducing a new pattern
9. Prefer adding new functionality through local routers rather than `remoteTrpc.*` — every upstream call site is future migration cost

## If UI Changed
10. Run `bun run dev` and manually verify the change renders correctly
11. Check for accessibility: keyboard navigation, aria labels on Radix components

## Before Committing
12. No `.env` files or secrets in staged changes
13. No `console.log` debugging statements left behind
14. Only stage files YOU modified — exclude pre-existing lockfile/package.json drift from parallel sessions
15. Verify documentation is in sync — CLAUDE.md "Documentation Maintenance" section lists 9 common drift points to check

## Dependency Changes
- `bun audit` / `bun audit --high` — Check for known vulnerabilities
- `bun outdated` — List outdated packages
- `bun update` — Semver-safe updates
- Research before major bumps; check peer dep constraints (Vite 6.x, Tailwind 3.x, shiki 3.x, `@azure/msal-node` 3.8.x are pinned)
- Verify Electron CVEs/release dates via `gh api repos/electron/electron/security-advisories` and `gh api repos/electron/electron/releases`

## Security-Sensitive Changes
- No new IPC handlers without sender validation (`event.senderFrame.url`, Electron 28+ pattern)
- No token previews / credential fragments in logs. The 5 historical leak sites in `claude.ts` and `claude/env.ts` were removed in Phase 0 gates #5-6 and are guarded by `tests/regression/token-leak-logs-removed.test.ts` — that guard scans all of `src/main/` for forbidden substrings on every `bun test` run.
- Any new binary downloader must verify SHA-256 checksums. The Claude binary downloader **also** verifies the manifest GPG signature (Phase 0 gate #7, guarded by `tests/regression/gpg-verification-present.test.ts`).
- MCP server URLs must validate through `src/main/lib/trpc/schemas/mcp-url.ts`
- Cross-check `.full-review/` findings catalogs before declaring related work done:
  - `.full-review/05-final-report.md` — v5 MSAL strategy review (135 findings, complete)
  - `.full-review/envoy-gateway-review/05-final-report.md` — Envoy Gateway strategy review (47 findings, **all 8 Critical resolved** as of 2026-04-08, Smoke Test Addendum at bottom)

## Phase 0 Hard Gate Status (12 of 15 complete as of 2026-04-08)
Reference: `.scratchpad/auth-strategy-envoy-gateway.md` v2.1 §6 and CLAUDE.md "Phase 0 progress" block.

**Completed gates** (do NOT re-implement; regression guards exist):
- ✅ #1-6 — `auth:get-token` IPC handler deletion + token preview log sanitization
- ✅ #7 — Claude binary SHA-256 + GPG signature verification, Codex SHA-256 verification
- ✅ #9 — `.github/workflows/ci.yml` minimum-viable CI
- ✅ #10 — Dependabot config (UI secret-scanning enable still pending)
- ✅ #11 — `bun:test` framework + 6 regression guards (14 tests total)
- ✅ #12 — Feature flag infrastructure (Drizzle table + lib + tRPC router)
- ✅ #13 — OpenSpec 1.2.0 migration
- ✅ #14 — Electron 39.8.6 → 39.8.7 patch
- ✅ #15 — F1-F10 restoration decisions

**Only remaining gate:**
- ⏳ **#8 — Upstream sandbox OAuth extraction** from `src/main/lib/trpc/routers/claude-code.ts:178-220`. Current implementation uses an upstream sandbox as the OAuth redirect host; must be replaced with a localhost-loopback redirect like `auth-manager.ts` already uses.

To verify Phase 0 status against filesystem evidence, invoke the `phase-0-progress` skill (in `.claude/skills/phase-0-progress/SKILL.md`).

## If Touching CLAUDE.md / README.md / CONTRIBUTING.md / AGENTS.md
- Verify cross-document consistency (the four docs share overlapping facts that drift independently)
- Run the `docs-drift-check` skill (`.claude/skills/docs-drift-check/SKILL.md`) — it codifies this audit
- Common drift points (per CLAUDE.md "Documentation Maintenance"):
  - Schema column lists vs `src/main/lib/db/schema/index.ts` (currently 7 tables)
  - tRPC router count vs `createAppRouter` composition (currently 21 routers)
  - Renderer feature subdirectories
  - Quality-gate naming (always: all four — `ts:check`, `build`, `test`, `audit`)
  - Hosted-vs-OSS feature claims (verify against actual code paths)
  - Binary version pins (Claude 2.1.96, Codex 0.118.0)
  - SDK package names
  - Phase 0 hard gate status (use `phase-0-progress` skill to verify)

## If Touching Documentation Inventory
- After updating CLAUDE.md/README.md/CONTRIBUTING.md/AGENTS.md, also refresh:
  - The corresponding Serena memories (these 6 files)
  - `.claude/PROJECT_INDEX.md` (auto-generated repo navigation map)
- Run `mcp__plugin_code-review-graph_code-review-graph__build_or_update_graph_tool` to refresh the code graph
- Memory files: `project_overview`, `codebase_structure`, `environment_and_gotchas`, `style_and_conventions`, `suggested_commands`, `task_completion_checklist`

## CI Status
- **CI exists** as of Phase 0 gate #9 (2026-04-08): `.github/workflows/ci.yml` runs all four quality gates on every PR to main
- Local quality gates are the same four — run them before pushing
- CI catches the same things you can catch locally, so don't rely on it as a safety net
