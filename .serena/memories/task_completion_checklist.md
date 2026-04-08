# Task Completion Checklist

When a task is completed, run through these steps:

## Required — Both Quality Gates
1. **Type check**: `bun run ts:check` — Stricter, tsgo-based. Catches type errors esbuild masks.
   - Current baseline: 104 pre-existing errors; only fail if count increases
2. **Dev build**: `bun run build` — Validates the electron-vite packaging pipeline produces a working artifact
   - **NEITHER gate is a superset of the other.** Both are required before submitting a PR.
   - Aligned wording across CLAUDE.md, CONTRIBUTING.md, AGENTS.md as of 2026-04-08

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
- No token previews / credential fragments in logs — there are **5 known existing leak sites** in `claude.ts:203, 247, 1540, 1634` and `claude/env.ts:302`; cleanup is a Phase 0 hard gate per `.scratchpad/auth-strategy-envoy-gateway.md` v2.1 §6
- Any new binary downloader must verify SHA256 checksums
- MCP server URLs must validate through `src/main/lib/trpc/schemas/mcp-url.ts`
- Cross-check `.full-review/` findings catalogs before declaring related work done:
  - `.full-review/05-final-report.md` — v5 MSAL strategy review (135 findings, complete)
  - `.full-review/envoy-gateway-review/05-final-report.md` — Envoy Gateway strategy review (47 findings, all 8 Critical resolved as of 2026-04-08, Smoke Test Addendum at bottom)

## Enterprise Auth Work (Phase 0 gates — strategy v2.1 §6)
Before touching anything in the auth path, verify these 15 Phase 0 hard gates from `.scratchpad/auth-strategy-envoy-gateway.md` §6 are merged. First three (lowest risk, highest value):
1. Delete `auth:get-token` IPC handler at `src/main/windows/main.ts:434`, `src/preload/index.ts:198`, `src/preload/index.ts:461` + regression test (CVSS 9.0 fix)
2. Remove all 5 token preview logs (above) + grep regression guard
3. Stand up minimum `.github/workflows/ci.yml` running `bun run ts:check + bun run build + bun audit` on PRs

## If Touching CLAUDE.md / README.md / CONTRIBUTING.md / AGENTS.md
- Verify cross-document consistency (the four docs share overlapping facts that drift independently)
- Common drift points (per CLAUDE.md "Documentation Maintenance"):
  - Schema column lists vs `src/main/lib/db/schema/index.ts`
  - tRPC router count vs `createAppRouter` composition
  - Renderer feature subdirectories
  - Quality-gate naming (always: both `ts:check` AND `build`)
  - Hosted-vs-OSS feature claims (verify against actual code paths)
  - Binary version pins (Claude 2.1.96, Codex 0.118.0)
  - SDK package names

## If Touching Documentation Inventory
- After updating CLAUDE.md/README.md/CONTRIBUTING.md/AGENTS.md, also refresh the corresponding Serena memories
- Run `mcp__plugin_code-review-graph_code-review-graph__build_or_update_graph_tool` to refresh the code graph
- Memory files are: `project_overview`, `codebase_structure`, `environment_and_gotchas`, `style_and_conventions`, `suggested_commands`, `task_completion_checklist`

## No CI Yet
- All quality gates run locally — no `.github/` workflows exist
- Don't assume CI will catch what you missed
