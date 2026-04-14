# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — **baseline 0 errors** (`.claude/.tscheck-baseline`). CI fails on ANY new TS error.
2. `bun run lint` — ESLint + eslint-plugin-sonarjs (~8s) — local-only advisory.
3. `bun run build` — electron-vite build (clean).
4. `bun test` — **30 regression files** (29 guards + 1 unit test; **174 tests / 414 expect() / ~6s**) + 20 1code-api test files (242 tests, 232 pass + 10 skipped integration). Total: ~412 tests across ~71 files.
5. `bun audit` — focus on NEW advisories only (55 baseline as of 2026-04-13).
6. CI also runs `cd docs && bun run build` (~20s).

Canonical reference: [`docs/conventions/quality-gates.md`](../../docs/conventions/quality-gates.md).

## If Schema Changed
- `bun run db:generate` — create migration from schema changes
- Verify migration file in `drizzle/` directory
- **NOTE:** `drizzle/0010_flowery_blackheart.sql` is a documented hand-edit exception.

## If New tRPC Router Added
- Register in `src/main/lib/trpc/routers/index.ts` (`createAppRouter`)
- Use the `new-router` skill to scaffold
- Current count: **22 routers**

## If New Regression Guard Added
- Use `new-regression-guard` skill to scaffold
- Update [`docs/conventions/regression-guards.md`](../../docs/conventions/regression-guards.md)
- Update any other surface that cites a guard count
- Current count: **29 guards + 1 unit test = 30 files**
- File-level allowlists, structured error messages, runs in <200ms

## If New Feature Flag Added
- Add to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`
- Add JSDoc block + update `docs/conventions/feature-flags.md`
- Current count: **9 flags** — `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`.

## If Introducing New Documentation
- Author as a `docs/` page — **never** as a `.scratchpad/` file cited from tracked files
- The `no-scratchpad-references` regression guard enforces this automatically

## If New Brand-Bearing Identifier
- Classify against `openspec/specs/brand-identity/spec.md` (Tier A/B/C)

## If UI Changed
- Run `bun run dev` and verify rendering
- Check accessibility: keyboard navigation, aria labels

## If TS Baseline Needs Update
- The baseline file is `.claude/.tscheck-baseline`, currently `0`
- To legitimately REDUCE: `bun run ts:check 2>&1 | grep -c "error TS" > .claude/.tscheck-baseline`
- To legitimately INCREASE: requires explicit justification; prefer fixing the error
- DO NOT delete the baseline file

## Before Committing
- No `.env` files or secrets staged
- No `console.log` debugging left behind (aux-AI module's `[aux-ai]` breadcrumbs ARE intentional and documented)
- Run `/docs-drift-check` if you touched schema, routers, version pins, or any doc surface
- If a parallel agent is working in the same repo, stage only YOUR files explicitly with `git add <files>`

## OpenSpec Workflow (for larger changes)
1. `/opsx:propose <description>` — create change with all artifacts
2. `/opsx:apply <name>` — implement tasks
3. `/opsx:verify <name>` — verify implementation matches artifacts
4. `/opsx:archive <name>` — archive and promote capability specs
- **16 capability specs (116 requirements)** in `openspec/specs/`
- **Active changes (4)**: `add-dual-mode-llm-routing` (28/55) · `improve-dev-launch-keychain-ux` (0/23) · `wire-login-button-to-msal` (45/57) · `upgrade-vite-8-build-stack` (15/50)
- Full rules: [`.claude/rules/openspec.md`](../../.claude/rules/openspec.md)

## Phase 0 Status (15 of 15 complete ✅)

## If Editing Credential Code
- All encryption MUST go through `src/main/lib/credential-store.ts`
- PreToolUse hook blocks violations; regression guard catches in CI

## If Editing Enterprise Auth / Token Injection Code
- Claude CLI 2.1.96 does NOT support `ANTHROPIC_AUTH_TOKEN_FILE`
- `applyEnterpriseAuth()` returns `Promise<void>` (2026-04-13)
- BYOK accounts skip the legacy OAuth token fallback — regression guard `no-legacy-oauth-byok-leak.test.ts`

## If Editing Aux-AI Module (aux-ai.ts or chats.ts delegation)
- DI factory pattern — new provider modes slot into the dispatch switch
- **Legacy Custom Model bridge:** when ProviderMode is null, `GenerateChatTitleOpts.customConfig` + `legacyCustomConfigSdkOpts()` synthesize the SDK call. `sk-ant-*` token → apiKey, else → authToken. User's explicit model wins over per-route default.
- Per-route model defaults: `gpt-5-nano` (LiteLLM) / `claude-haiku-4-5` (Anthropic direct). Retired `claude-3-5-haiku-latest` must NOT reappear.
- Structured `[aux-ai]` breadcrumbs at entry + SDK call + success/failure — required for Group 18-style runtime smoke.
- **Regression guards:** `aux-ai-provider-dispatch.test.ts` (18 tests, shape-based), `no-apollosai-aux-ai-fetch.test.ts` (6 tests).
- Default Ollama generator stubs MUST declare params explicitly (SonarJS otherwise infers zero-arg contract).

## If Editing Signed-Fetch / Stream-Fetch Handlers (src/main/windows/main.ts)
- **`checkUpstreamGate(url, rawApiUrl)` is the entry gate** — rejects unset `MAIN_VITE_API_URL` or apollosai.dev hostname
- **`unreachableCache` with 60s TTL** short-circuits retries
- **`recordUnreachable` unwraps undici `err.cause.code`** + accepts `TypeError("fetch failed")` as cache-worthy — essential for fetch() error handling
- Regression guard: `tests/regression/signed-fetch-cache.test.ts` (12 tests, shape-based)
- NEVER fall back to `|| "https://apollosai.dev"` — that was the silent-leak default before 2026-04-13

## If Editing Main-Process Frontmatter Parsing
- All frontmatter parsing MUST import `{ matter }` from `src/main/lib/frontmatter.ts`
- Regression guard `tests/regression/no-gray-matter.test.ts` enforces the rule
