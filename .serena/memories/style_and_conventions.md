# Code Style and Conventions

## File Naming
- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## TypeScript
- Strict mode via tsconfig.json
- Zod for runtime validation on tRPC procedure inputs
- Type inference preferred over explicit annotations
- `tsgo` used instead of `tsc` — faster but has known gaps with mapped-type recursion
- Current baseline: ~87 pre-existing errors (stored in `.claude/.tscheck-baseline`)

## State Management
- **Jotai**: UI state (selected chat, sidebar, preview)
- **Zustand**: Persisted state (sub-chat tabs, pinned items — localStorage)
- **React Query via tRPC**: Server state (auto-caching, refetch)
- Never duplicate server state in Jotai/Zustand

## IPC Communication
- All main↔renderer via tRPC (trpc-electron) — no raw IPC calls
- Preload exposes `window.desktopApi` for native features only

## No .scratchpad/ References from Tracked Files
- `.scratchpad/` is gitignored — never reference specific files from tracked surfaces
- Canonical docs live in `docs/` — always link to `docs/` pages
- Enforced by `tests/regression/no-scratchpad-references.test.ts`
- Do not introduce new `remoteTrpc.*` call sites without documenting in `docs/enterprise/upstream-features.md`
- All credential encryption goes through `src/main/lib/credential-store.ts` — no direct `safeStorage` calls elsewhere (enforced by hook + regression guard)

## Brand Taxonomy (per `openspec/specs/brand-identity/spec.md`)
- **Tier A (upstream brand — MUST REMOVE):** `21st`, `twentyfirst`, `1code.dev`, etc.
- **Tier B (product name — KEEP):** `"1Code"`, `1code-desktop`, `.1code/`
- **Tier C (attribution — PRESERVED):** only at allowlisted positions per the spec
- Enforced by `tests/regression/brand-sweep-complete.test.ts`

## Quality Gates (no formatter, no linter)
- No Prettier, ESLint, or Biome configured
- Four automated quality gates + docs build (5 in CI)
- All required before submitting a PR

## Regression Guard Conventions
- File-level allowlists (not line-number)
- Every allowlist entry has a comment explaining the exemption
- Structured error messages with file:line, snippet, actionable next step
- Side-effect free, no network, runs in &lt;200ms
- Use `new-regression-guard` skill to scaffold
