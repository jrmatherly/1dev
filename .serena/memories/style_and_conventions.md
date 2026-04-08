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
  3. `bun test` (5 regression guards under `tests/regression/`, ~100ms total)
  4. `bun audit` (dependency vulnerability scan)
- All four together run in under 2 minutes on an M-series Mac
- The same four are enforced in `.github/workflows/ci.yml` on every PR to main
