# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — **baseline 0 errors** (`.claude/.tscheck-baseline`, reduced from 32 → 0 on 2026-04-11 commit `e1efae2`). **CI fails on ANY new TS error.**
2. `bun run lint` — ESLint + eslint-plugin-sonarjs (~8s) — local-only advisory.
3. `bun run build` — electron-vite build (clean).
4. `bun test` — **30 regression files** (29 guards + 1 unit test; 170 tests / 393 expect() / ~6s) + 20 1code-api test files (242 tests, 232 pass + 10 skipped integration). Total: ~412 tests across ~71 files.
5. `bun audit` — focus on NEW advisories only (55 baseline as of 2026-04-13).
6. CI also runs `cd docs && bun run build` — recommended locally too (~20s).

Canonical reference: [`docs/conventions/quality-gates.md`](../../docs/conventions/quality-gates.md).

## If Schema Changed
- `bun run db:generate` — create migration from schema changes
- Verify migration file in `drizzle/` directory
- **NOTE:** `drizzle/0010_flowery_blackheart.sql` is a documented hand-edit exception (see `.claude/rules/database.md` "Allowed exceptions"). Future hand-edits need peer review + registry entry.

## If New tRPC Router Added
- Register in `src/main/lib/trpc/routers/index.ts` (`createAppRouter`)
- Use the `new-router` skill to scaffold
- Current count: **22 routers** (21 feature routers + `createGitRouter()`)

## If New Regression Guard Added
- Use `new-regression-guard` skill to scaffold
- Update [`docs/conventions/regression-guards.md`](../../docs/conventions/regression-guards.md) — the canonical guard list
- Update any other surface that cites a guard count (CLAUDE.md, PROJECT_INDEX.md, Serena memories that mention a count)
- Current count: **29 guards + 1 unit test = 30 files**
- File-level allowlists, structured error messages, runs in <200ms
- See [`.claude/rules/testing.md`](../../.claude/rules/testing.md) for the full guard requirements

## If New Feature Flag Added
- Add to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts` (one-line change; type inferred from literal default).
- Add JSDoc block explaining purpose + precedence.
- Update `docs/conventions/feature-flags.md` current-flags table.
- Current count: **9 flags** — `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`.

## If Introducing New Documentation
- Author as a `docs/` page — **never** as a `.scratchpad/` file cited from tracked files
- Reference `docs/` pages from CLAUDE.md, skills, agents, test comments
- The `no-scratchpad-references` regression guard enforces this automatically

## If New Brand-Bearing Identifier
- Classify against `openspec/specs/brand-identity/spec.md` (Tier A/B/C)
- The `brand-sweep-complete` guard enforces Tier A removal automatically

## If UI Changed
- Run `bun run dev` and verify rendering
- Check accessibility: keyboard navigation, aria labels

## If TS Baseline Needs Update
- The baseline file is `.claude/.tscheck-baseline`, currently `0`
- To legitimately REDUCE the baseline: `bun run ts:check 2>&1 | grep -c "error TS" > .claude/.tscheck-baseline`
- To legitimately INCREASE: requires explicit justification; prefer fixing the error
- The PostToolUse hook blocks any edit that increases the count
- DO NOT delete the baseline file

## Before Committing
- No `.env` files or secrets staged
- No `console.log` debugging left behind (aux-AI module's `console.error` fallback-failure logs ARE intentional and documented)
- Run `/docs-drift-check` skill if you touched schema, routers, version pins, or any doc surface
- Verify `docs/conventions/pinned-deps.md` accuracy before touching version-sensitive code
- Grep for actual imports (ground truth) rather than trusting research patterns alone
- If a parallel agent is working in the same repo, stage only YOUR files explicitly with `git add <files>` — never `git add -A`

## OpenSpec Workflow (for larger changes)
1. `/opsx:propose <description>` — create change with all artifacts
2. `/opsx:apply <name>` — implement tasks
3. `/opsx:verify <name>` — verify implementation matches artifacts
4. `/opsx:archive <name>` — archive and promote capability specs
- **15 capability specs (109 requirements)** in `openspec/specs/`
- **Active changes (5)**: `remediate-dev-server-findings` (58/71, Groups 1-19 landed) · `add-dual-mode-llm-routing` (28/55) · `improve-dev-launch-keychain-ux` (0/23) · `wire-login-button-to-msal` (45/57) · `upgrade-vite-8-build-stack` (15/50)
- Full rules: [`.claude/rules/openspec.md`](../../.claude/rules/openspec.md)

## Phase 0 Status (15 of 15 complete ✅)
All gates closed. Phase 0.5 (harden-credential-storage) also complete.

## If Editing Credential Code
- All encryption MUST go through `src/main/lib/credential-store.ts`
- Do NOT add `safeStorage.encryptString/decryptString` calls in any other file
- PreToolUse hook blocks violations; regression guard catches in CI
- Full rule: [`.claude/rules/credential-storage.md`](../../.claude/rules/credential-storage.md)

## If Editing Enterprise Auth / Token Injection Code
- Claude CLI 2.1.96 does NOT support `ANTHROPIC_AUTH_TOKEN_FILE` — use `ANTHROPIC_AUTH_TOKEN` env var
- `ANTHROPIC_AUTH_TOKEN` is in `STRIPPED_ENV_KEYS_BASE`; `applyEnterpriseAuth()` in `env.ts` injects after strip
- **`applyEnterpriseAuth()` now returns `Promise<void>`** (2026-04-13 — was returning `env`)
- `auth-manager.ts` uses Strangler Fig pattern — `enterpriseAuthEnabled` flag branches all methods
- `ensureReady()` must be awaited at startup before checking auth state
- **BYOK accounts skip legacy OAuth token fallback (2026-04-13)** — regression guard: `no-legacy-oauth-byok-leak.test.ts`
- Full rule: [`.claude/rules/auth-env-vars.md`](../../.claude/rules/auth-env-vars.md)

## If Editing Aux-AI Module (aux-ai.ts or chats.ts delegation)
- Use the DI factory pattern — new provider modes slot into `makeGenerateChatTitle` / `makeGenerateCommitMessage` switch
- **Regression guard `aux-ai-provider-dispatch.test.ts`** checks shape: factory exports, per-mode branches, customerId header, model precedence (flag → modelMap → default `claude-3-5-haiku-latest`), `auxAiEnabled` kill-switch in BOTH factories, hardcoded max_tokens/temperature
- **Regression guard `no-apollosai-aux-ai-fetch.test.ts`** fails if upstream apollosai.dev/api/agents/* references return
- Default Ollama generator stubs MUST declare params explicitly (`async (_userMessage, _model) => null`) — SonarJS otherwise infers zero-arg contract and flags call sites

## If Editing Signed-Fetch / Stream-Fetch Handlers (src/main/windows/main.ts)
- **`checkUpstreamGate(url, rawApiUrl)` is the entry gate** — rejects unset `MAIN_VITE_API_URL` or apollosai.dev hostname
- **`unreachableCache` with 60s TTL** short-circuits ECONNREFUSED/ENOTFOUND retries
- Regression guard: `tests/regression/signed-fetch-cache.test.ts` (shape-based, 11 tests)
- NEVER fall back to `|| "https://apollosai.dev"` — that was the silent-leak default before 2026-04-13

## If Editing Main-Process Frontmatter Parsing
- All frontmatter parsing MUST import `{ matter }` from `src/main/lib/frontmatter.ts` (the canonical shim)
- Regression guard `tests/regression/no-gray-matter.test.ts` enforces the rule
- Full spec: `openspec/specs/frontmatter-parsing/spec.md` (6 requirements / 15 scenarios)
