# Code Style and Conventions

## File Naming
- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## TypeScript
- Strict mode via tsconfig.json
- Zod for runtime validation on tRPC procedure inputs
- Type inference preferred over explicit annotations where possible
- `tsgo` (Go-based checker) used instead of `tsc` — faster but has known gaps with mapped-type recursion; fall back to `tsc` for tricky type errors
- Current baseline is ~88 pre-existing errors (stored in `.claude/.tscheck-baseline` and enforced by PostToolUse hook)

## Brand Taxonomy (codified 2026-04-09 in `openspec/specs/brand-identity/spec.md`)
Every new identifier, string, URL, filesystem path, or comment in `src/`, `scripts/`, `package.json`, or `README.md` must be classified against three tiers BEFORE committing:
- **Tier A — upstream brand, MUST REMOVE:** `21st`, `twentyfirst`, `1code.dev`, `cdn.21st.dev`, `dev.21st.*`, `github.com/21st-dev/*`, `@21st-dev/*`, `21st-desktop`, `21st-notarize`
- **Tier B — product name, KEEP:** `"1Code"` (display), `1code-desktop` (package), `resources/cli/1code` (CLI), `.1code/worktree.json`, `~/.1code/` filesystem directories
- **Tier C — attribution, PRESERVED:** only at the allowlisted positions enumerated in the spec (currently `src/main/lib/cli.ts:6` comment and `README.md` attribution + historical mentions + upstream-pointer)
- Enforced by `tests/regression/brand-sweep-complete.test.ts` (file-level allowlist; any file-level Tier A leak fails the guard)
- See the capability spec for the full 11 SHALL/MUST requirements and 16 testable scenarios

## Security Patterns to Enforce
- Never log token previews or credential fragments. The 5 historical leak sites in `claude.ts` and `claude/env.ts` were removed in Phase 0 gates #5-6 and are now guarded by `tests/regression/token-leak-logs-removed.test.ts`.
- Use `event.senderFrame.url` (Electron 28+), not `event.sender.getURL()`, in IPC sender validation
- Delete dead IPC handlers — `auth:get-token` was a CVSS 9.0 dead-code path, removed in Phase 0 gates #1-4 and guarded by `tests/regression/auth-get-token-deleted.test.ts`
- All binary downloads must verify SHA-256 checksums. Claude binary downloader **also** verifies the manifest GPG signature against the vendored Anthropic public key (Phase 0 gate #7, guarded by `tests/regression/gpg-verification-present.test.ts`).
- MCP server URLs must go through `src/main/lib/trpc/schemas/mcp-url.ts` (SSRF-safe validation)
- Do not introduce new `remoteTrpc.*` call sites without flagging them in `.scratchpad/upstream-features-inventory.md` — every one becomes a future migration cost. The `upstream-boundary-check` skill exists to enforce this on Edit/Write to renderer files.

## State Management Rules
- **Jotai**: UI state (selected chat, sidebar open, preview settings)
- **Zustand**: Persisted state (sub-chat tabs, pinned items — localStorage)
- **React Query via tRPC**: Server state (auto-caching, refetch)
- Never duplicate server state in Jotai/Zustand

## IPC Communication
- All main↔renderer communication via tRPC (trpc-electron)
- No raw IPC calls — always use tRPC routers
- Preload exposes `window.desktopApi` for native features only (window controls, clipboard, notifications)

## Component Patterns
- Radix UI primitives for accessible components
- `cn()` utility with tailwind-merge for class merging
- class-variance-authority (CVA) for component variants
- Motion (framer-motion) for animations

## Quality Gates (no formatter, no linter, minimal test suite)
- No Prettier, ESLint, or Biome configured
- `bun:test` is the only test framework (no Jest, Vitest, or Playwright). Bootstrapped 2026-04-08 as Phase 0 gate #11.
- **Four automated quality gates** — all required before submitting a PR (none is a superset of the others):
  1. `bun run ts:check` (tsgo, stricter, catches type errors esbuild masks). Baseline: 88 errors stored in `.claude/.tscheck-baseline`. PostToolUse hook tracks drift on every TS edit.
  2. `bun run build` (electron-vite, validates packaging pipeline)
  3. `bun test` (6 regression guards, 14 tests under `tests/regression/`, ~200ms total as of 2026-04-09)
  4. `bun audit` (dependency vulnerability scan — focus on NEW advisories, ignore the ~57 pre-existing transitive dev-dep entries)
- All four together run in under 2 minutes on an M-series Mac
- The same four are enforced in `.github/workflows/ci.yml` on every PR to main

## Regression Guard Conventions
When adding a new bun:test regression guard under `tests/regression/`:
- Use the `new-regression-guard` skill (`.claude/skills/new-regression-guard/SKILL.md`) to scaffold — it mirrors the existing 6-guard file-walking pattern
- Use **file-level allowlists** (`Set<string>` of repo-relative paths), NOT line-number allowlists — file-level survives edits within the allowlisted file
- Every allowlist entry must have a comment explaining why the file is exempt (which Tier or category)
- Every guard's error message must contain: count, structured file:line list with truncated snippet, actionable next step, and a reference to the OpenSpec change or Phase 0 gate that motivated it
- Guards must run in <200ms, be side-effect free, and not require network access
- When adding a guard, increment the count in `CLAUDE.md:253` (the "6 tests" line) — this is a documented drift point
