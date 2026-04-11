# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — **baseline 0 errors** (`.claude/.tscheck-baseline`, reduced from 32 → 0 on 2026-04-11 commit `e1efae2`). **CI now fails on ANY new TS error.**
2. `bun run lint` — ESLint + eslint-plugin-sonarjs (~8s)
3. `bun run build` — electron-vite build (currently emits 1 known Rollup warning from `gray-matter/lib/engines.js`, scheduled for removal under `replace-gray-matter-with-front-matter`)
4. `bun test` — 15 regression guards + 20 1code-api test files = 199 tests across 35 files (189 pass + 10 skipped integration, 0 fail)
5. `bun audit` — focus on NEW advisories only
6. CI also runs `cd docs && bun run build` — recommended locally too

Canonical reference: [`docs/conventions/quality-gates.md`](../../docs/conventions/quality-gates.md).

## If Schema Changed
- `bun run db:generate` — create migration from schema changes
- Verify migration file in `drizzle/` directory

## If New tRPC Router Added
- Register in `src/main/lib/trpc/routers/index.ts` (`createAppRouter`)
- Use the `new-router` skill to scaffold

## If New Regression Guard Added
- Use `new-regression-guard` skill to scaffold
- Update [`docs/conventions/regression-guards.md`](../../docs/conventions/regression-guards.md) — the canonical guard list (authoritative count + purpose)
- Update any other surface that cites a guard count (CLAUDE.md, PROJECT_INDEX.md, Serena memories that mention a count)
- File-level allowlists, structured error messages, runs in <200ms
- See [`.claude/rules/testing.md`](../../.claude/rules/testing.md) for the full guard requirements

## If Introducing New Documentation
- Author as a `docs/` page — **never** as a `.scratchpad/` file cited from tracked files
- Reference `docs/` pages from CLAUDE.md, skills, agents, test comments
- The `no-scratchpad-references` regression guard enforces this automatically
- See `docs/conventions/no-scratchpad-references.md` for the rule

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
- The PostToolUse hook blocks any edit that increases the count — if blocked, investigate the root cause before increasing
- DO NOT delete the baseline file

## Before Committing
- No `.env` files or secrets staged
- No `console.log` debugging left behind
- Run `/docs-drift-check` skill if you touched schema, routers, version pins, or any doc surface. The skill catalog of drift points lives in `.claude/skills/docs-drift-check/SKILL.md`.
- Verify `docs/conventions/pinned-deps.md` accuracy before touching version-sensitive code
- Grep for actual imports (ground truth) rather than trusting research patterns alone
- If a parallel agent is working in the same repo, stage only YOUR files explicitly with `git add <files>` — never `git add -A`

## OpenSpec Workflow (for larger changes)
1. `/opsx:propose <description>` — create change with all artifacts
2. `/opsx:apply <name>` — implement tasks
3. `/opsx:verify <name>` — verify implementation matches artifacts
4. `/opsx:archive <name>` — archive and promote capability specs
- **12 capability specs (85 requirements)** in `openspec/specs/`: `1code-api-litellm-provisioning` (19), `brand-identity` (11), `claude-code-auth-import` (2), `credential-storage` (7), `documentation-site` (5), `electron-runtime` (4), `enterprise-auth` (5), `enterprise-auth-wiring` (4), `feature-flags` (6), `renderer-data-access` (5), `self-hosted-api` (11), `shiki-highlighter` (6)
- **Active changes (2)**: `replace-gray-matter-with-front-matter` (0/67), `upgrade-vite-8-build-stack` (15/50)
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
- `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_AUTH_TOKEN_FILE` are in `STRIPPED_ENV_KEYS_BASE`
- `applyEnterpriseAuth()` in `env.ts` injects fresh token AFTER the strip pass
- `buildClaudeEnv()` is now **async** (`Promise<Record<string, string>>`) — 1 call site at `claude.ts:1142`
- `auth-manager.ts` uses Strangler Fig pattern — `enterpriseAuthEnabled` flag branches all methods
- `ensureReady()` must be awaited at startup before checking auth state
- Do NOT enable `clientCapabilities: ["CP1"]` — LiteLLM is not CAE-enabled (28h unrevocable tokens)
- Full rule: [`.claude/rules/auth-env-vars.md`](../../.claude/rules/auth-env-vars.md)

## If Editing Main-Process Frontmatter Parsing (pending `replace-gray-matter-with-front-matter`)
- Post-merge: all frontmatter parsing SHALL import `matter` from `src/main/lib/frontmatter.ts` (the canonical shim). Direct `front-matter` / `gray-matter` / `vfile-matter` / `js-yaml` imports are forbidden outside the shim.
- Regression guard `tests/regression/no-gray-matter.test.ts` (planned) will enforce the rule.
- Implementation MUST happen in a git worktree per `tasks.md` §1 + §13 of the change.
- Full spec: `openspec/changes/replace-gray-matter-with-front-matter/specs/frontmatter-parsing/spec.md` (not yet promoted to baseline).
