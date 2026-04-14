# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — **baseline 0 errors** (`.claude/.tscheck-baseline`). CI fails on ANY new TS error.
2. `bun run lint` — ESLint + eslint-plugin-sonarjs (~8s) — local-only advisory.
3. `bun run build` — electron-vite build (clean).
4. `bun test` — **31 regression files** (30 guards + 1 unit test; **186 tests / 435 expect() / ~6s**) + 20 1code-api test files (242 tests, 232 pass + 10 skipped integration). Total: ~416 tests across ~72 files.
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
- Current count: **23 routers** (22 feature + 1 git; `litellmModels` added 2026-04-13)
- **Drift surfaces** (trpc-router-auditor catches these): `docs/architecture/trpc-routers.md` (header subtitle + intro + table + total-count footer), `docs/architecture/tech-stack.md`, `docs/architecture/overview.md`, CLAUDE.md, `.claude/PROJECT_INDEX.md`, `.serena/memories/codebase_structure.md`.

## If New Regression Guard Added
- Use `new-regression-guard` skill to scaffold
- Update [`docs/conventions/regression-guards.md`](../../docs/conventions/regression-guards.md)
- Update any other surface that cites a guard count
- Current count: **30 guards + 1 unit test = 31 files**
- File-level allowlists, structured error messages, runs in <200ms

## If New Feature Flag Added
- Add to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`
- Add JSDoc block + update `docs/conventions/feature-flags.md`
- Current count: **9 flags** — `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`.

## If Introducing New Documentation
- Author as a `docs/` page — **never** as a `.scratchpad/` file cited from tracked files
- Add to `docs/docs.json` sidebar if it needs nav visibility
- The `no-scratchpad-references` regression guard enforces the rule automatically

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
- No `console.log` debugging left behind (aux-AI module's `[aux-ai]` breadcrumbs ARE intentional)
- Run `/docs-drift-check` if you touched schema, routers, version pins, or any doc surface
- If a parallel agent is working in the same repo, stage only YOUR files explicitly

## OpenSpec Workflow (for larger changes)
1. `/opsx:propose <description>` — create change with all artifacts
2. `/opsx:apply <name>` — implement tasks
3. `/opsx:verify <name>` — verify implementation matches artifacts
4. `/opsx:archive <name>` — archive and promote capability specs
- **16 capability specs (116 requirements)** in `openspec/specs/`
- **Active changes (4)**: `add-dual-mode-llm-routing` (36/55 — Groups 1-8 + 10 landed; Group 9 UI wizard + 11 smoke + 12 gates + 13 archive pending) · `improve-dev-launch-keychain-ux` (0/23) · `wire-login-button-to-msal` (45/57) · `upgrade-vite-8-build-stack` (15/50)

## Phase 0 Status (15 of 15 complete ✅)

## If Editing Credential Code
- All encryption MUST go through `src/main/lib/credential-store.ts`

## If Editing Enterprise Auth / Token Injection Code
- Claude CLI 2.1.96 does NOT support `ANTHROPIC_AUTH_TOKEN_FILE`
- `applyEnterpriseAuth()` returns `Promise<void>` (2026-04-13)
- BYOK accounts skip the legacy OAuth token fallback — regression guard `no-legacy-oauth-byok-leak.test.ts`

## If Editing Aux-AI Module (aux-ai.ts or chats.ts delegation)
- DI factory pattern — new provider modes slot into the dispatch switch
- **Legacy Custom Model bridge:** `GenerateChatTitleOpts.customConfig` + `legacyCustomConfigSdkOpts()` synthesize the SDK call when ProviderMode is null
- Per-route model defaults: `gpt-5-nano` (LiteLLM) / `claude-haiku-4-5` (Anthropic direct). Retired `claude-3-5-haiku-latest` must NOT reappear.
- Structured `[aux-ai]` breadcrumbs required for Group 18-style runtime smoke
- **Regression guards:** `aux-ai-provider-dispatch.test.ts`, `no-apollosai-aux-ai-fetch.test.ts`

## If Editing litellmModels Router (litellm-models.ts)
- Reads `process.env.MAIN_VITE_LITELLM_BASE_URL` — never hardcode a cluster URL
- Bearer auth: `Authorization: Bearer ${virtualKey}` (NOT `Authorization: ${virtualKey}`)
- Preserve the 4-code TRPCError mapping (INTERNAL_SERVER_ERROR / UNAUTHORIZED / BAD_GATEWAY / UNPROCESSABLE_CONTENT)
- Project LiteLLM's envelope to minimal `{id}` shape; don't leak upstream fields
- **Regression guard:** `litellm-models-router.test.ts` (12 shape-based tests)

## If Editing Signed-Fetch / Stream-Fetch Handlers (src/main/windows/main.ts)
- **`checkUpstreamGate(url, rawApiUrl)` is the entry gate** — rejects unset `MAIN_VITE_API_URL` or apollosai.dev hostname
- **`unreachableCache` with 60s TTL** short-circuits retries
- **`recordUnreachable` unwraps undici `err.cause.code`** + accepts `TypeError("fetch failed")` as cache-worthy
- Regression guard: `tests/regression/signed-fetch-cache.test.ts` (12 shape-based tests)
- NEVER fall back to `|| "https://apollosai.dev"` — that was the silent-leak default before 2026-04-13

## If Editing Main-Process Frontmatter Parsing
- All frontmatter parsing MUST import `{ matter }` from `src/main/lib/frontmatter.ts`
- Regression guard `tests/regression/no-gray-matter.test.ts` enforces the rule
