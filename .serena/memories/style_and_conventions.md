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
- **Do NOT propose LiteLLM Enterprise-gated features** — cluster runs LiteLLM OSS only (no Enterprise license). Features like `general_settings.enable_jwt_auth`, `allowed_routes`, per-team/per-key guardrails, `/spend/report`, custom tag budgets, and secret manager integration will raise `ValueError("... is an enterprise only feature.")` at startup. The canonical OSS pattern for JWT auth is Envoy Gateway `SecurityPolicy` + `claimToHeaders` (trust-the-edge). Authoritative list in auto-memory `project_litellm_feature_boundary.md` (loaded via `MEMORY.md` at session start); tracked for promotion to `docs/enterprise/litellm-oss-boundary.md` per P3-Cleanup roadmap item. Received as briefing from cluster agent 2026-04-11.

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
- **SonarLint workspace limitation:** `sonarlint.rules` scope is `application`, so VS Code ignores workspace suppressions — developer must paste the block into User Settings JSON once. Project's `.vscode/settings.json` is tracked as documentation of intent.

### SonarLint remediation gotchas (learned 2026-04-11 during agents-* cleanup)
- **S7758 (`charCodeAt→codePointAt`)** is WRONG for hash functions — do NOT apply. Semantically different on surrogate pairs; the hash change can invalidate cache keys downstream. Safe for byte-string extraction (e.g., `atob()` output).
- **S7776 ("should be a `Set`")** sometimes false-fires on `string.includes()` — SonarLint misidentifies string `.includes()` as array `.includes()`. Never convert a string to a Set. Check the variable's type first.
- **S7755 (`.at(-N)`)** is safer than `arr[arr.length-N]` but changes the return type from `T` to `T | undefined`. Under strict TypeScript, this introduces new TS errors at call sites that assume non-undefined. Fix: either add a non-null assertion (`.at(-1)!`) when guarded by a length check, or add an `?? null`/`?? default` fallback.
- **S6594 (`.match(re)` → RegExp.prototype.exec(str))** is semantically equivalent ONLY for non-global regexes. For `/g` regexes, `.match` returns all matches while the regex-exec call returns one — do NOT apply to `/g` patterns. Also: the local PreToolUse Edit security hook falsely blocks the string `.exec(` by regex-matching it as child_process API — retrying the Edit usually works.
- **S1479 (>30 case switch)** — preferred fix is a `Record<string, Component>` lookup table rather than splitting the switch. Eliminates both S1479 and any S6836 lexical-decl-in-case in one shot. Example: `getFileIconByExtension` in `src/renderer/features/agents/mentions/agents-file-mention.tsx` (34 cases → 50-key record).
- **S4158 ("can only be empty here")** — when the empty collection is an F-entry stub (e.g., `teams: [] = []` for F3), DO NOT suppress. The warning IS the reminder to restore the feature. Document the F-entry in the inline comment.
- **S2589 ("always evaluates to truthy")** findings can auto-resolve when dead code above the flagged line is removed (the narrowing context changes). Don't hunt these down immediately — clean dead code first, then re-verify.

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
