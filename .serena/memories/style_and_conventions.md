# Code Style and Conventions

> Behavioral rules loaded automatically by Claude Code live in [`.claude/rules/`](../../.claude/rules/). This memory summarizes the conventions for human reference — Claude Code enforces them via rule files and regression guards.

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
- **Current baseline: 0 pre-existing errors** (stored in `.claude/.tscheck-baseline`) — reduced from 80 → 63 → 54 → 45 → 38 → 34 → 32 → 26 → **0** via successive SonarLint remediation + 2026-04-10/11 type fix sweeps. Final cleanup 2026-04-11 commit `e1efae2` fixed all remaining buckets: desktop routing stubs, `setDiffStats` useCallback typing, `"plugin"` source union widening, `UploadedFile.mediaType` addition, null→undefined narrowing, removed obsolete `Selection.getComposedRanges` polyfill, `CodexMcpServerForSettings` widened, `DiffSidebarContentProps`/`DiffSidebarRendererProps`/`AgentDiffView` prop-shape unification. CI now fails on ANY new TS error.

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
- **Token injection for CLI subprocesses:** Use `ANTHROPIC_AUTH_TOKEN` env var (Claude CLI 2.1.96 does NOT support `ANTHROPIC_AUTH_TOKEN_FILE`). `ANTHROPIC_AUTH_TOKEN` must be in `STRIPPED_ENV_KEYS_BASE`. Future: `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD-based) when CLI pin is bumped.
- **Do NOT enable MSAL `clientCapabilities: ["CP1"]`** — LiteLLM is not CAE-enabled

## Brand Taxonomy (per `openspec/specs/brand-identity/spec.md`)
- **Tier A (upstream brand — MUST REMOVE):** `21st`, `twentyfirst`, `1code.dev`, etc.
- **Tier B (product name — KEEP):** `"1Code"`, `1code-desktop`, `.1code/`
- **Tier C (attribution — PRESERVED):** only at allowlisted positions per the spec
- Enforced by `tests/regression/brand-sweep-complete.test.ts`

## Code Quality Tooling

### ESLint + eslint-plugin-sonarjs (added 2026-04-10)
- `eslint.config.mjs` — ESLint 10 flat config with `eslint-plugin-sonarjs` v4
- `bun run lint` — project-wide SonarJS scan (~8s, replaces file-by-file IDE approach)
- Type-aware rules intentionally disabled (`projectService` off) — overlap with tsgo, adds ~40s
- ~35 rules suppressed with documented rationale for Electron/React patterns
- ESLint 10 breaking change: `eslint-disable` comments referencing uninstalled plugins are hard errors — removed 19 stale comments from upstream code

### SonarLint IDE Configuration
- `.vscode/settings.json` tracked in git with 50 rule suppressions (TS/JS/CSS) — grew from 16 during 2026-04-10 remediation session
- Rules suppressed in both `typescript:` and `javascript:` prefixes (HTML inline scripts use JS prefix)
- `// NOSONAR` inline comment for one-off suppressions (e.g., djb2 `charCodeAt` in chat-markdown-renderer.tsx)
- S7758 (`charCodeAt→codePointAt`) is WRONG for hash functions — do NOT apply

## IDE vs tsgo Divergence
- VS Code's TypeScript language service (using bundled `typescript`) occasionally reports errors that `tsgo` does not, and vice versa. The `.claude/.tscheck-baseline` file is **tsgo-based** (authoritative for CI).
- Example from 2026-04-11: `mcp-servers-indicator.tsx:52` IDE-reported `status: string` not assignable to `MCPServerStatus` — `tsgo` resolved it through a different path and didn't flag it. Still fixed with a cast at the tRPC boundary for IDE ergonomics.
- **When debugging error-count discrepancies:** always run `bun run ts:check` — that is the authoritative count.

## Quality Gates
- Six automated quality gates + docs build (6 in CI)
- All required before submitting a PR

## OpenSpec Conventions
- Change proposals should include cross-dependency ordering analysis when multiple upgrades interact
- Multi-reviewer pattern proved valuable: 5 agents found issues individual reviewers missed
- Upgrade proposals need spike tasks for untested integration points (e.g. `@tailwindcss/vite` + `electron-vite`)
- Verify `docs/conventions/pinned-deps.md` accuracy before touching version-sensitive code
- Grep for actual imports (ground truth) rather than trusting research patterns alone

## Regression Guard Conventions
- File-level allowlists (not line-number)
- Every allowlist entry has a comment explaining the exemption
- Structured error messages with file:line, snippet, actionable next step
- Side-effect free, no network, runs in &lt;200ms
- Use `new-regression-guard` skill to scaffold
