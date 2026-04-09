# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — baseline 87 errors (`.claude/.tscheck-baseline`), only fail if count increases
2. `bun run build` — electron-vite build
3. `bun test` — 11 guards, 45 tests under `tests/regression/`
4. `bun audit` — focus on NEW advisories only
5. CI also runs `cd docs && bun run build` — recommended locally too

## If Schema Changed
- `bun run db:generate` — create migration from schema changes
- Verify migration file in `drizzle/` directory

## If New tRPC Router Added
- Register in `src/main/lib/trpc/routers/index.ts` (`createAppRouter`)
- Use the `new-router` skill to scaffold

## If New Regression Guard Added
- Use `new-regression-guard` skill to scaffold
- Increment guard count in CLAUDE.md and Serena memories
- File-level allowlists, structured error messages, runs in &lt;200ms

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

## Before Committing
- No `.env` files or secrets staged
- No `console.log` debugging left behind
- Verify documentation sync (CLAUDE.md drift points)

## OpenSpec Workflow (for larger changes)
1. `/opsx:propose <description>` — create change with all artifacts
2. `/opsx:apply <name>` — implement tasks
3. `/opsx:archive <name>` — archive and promote capability specs
- 7 capability specs in `openspec/specs/`: `brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`, `credential-storage`, `renderer-data-access`, `enterprise-auth`

## Phase 0 Status (15 of 15 complete ✅)
All gates closed. Phase 0.5 (harden-credential-storage) also complete.

## If Editing Credential Code
- All encryption MUST go through `src/main/lib/credential-store.ts`
- Do NOT add `safeStorage.encryptString/decryptString` calls in any other file
- PreToolUse hook blocks violations; regression guard catches in CI

## If Editing Enterprise Auth / Token Injection Code
- Claude CLI 2.1.96 does NOT support `ANTHROPIC_AUTH_TOKEN_FILE` — use `ANTHROPIC_AUTH_TOKEN` env var
- `ANTHROPIC_AUTH_TOKEN` must be in `STRIPPED_ENV_KEYS_BASE` (prevents shell-inherited leaks)
- Do NOT enable `clientCapabilities: ["CP1"]` — LiteLLM is not CAE-enabled (28h unrevocable tokens)
- `buildClaudeEnv()` has 1 call site (`claude.ts:1142`) — NOT 5 as auth-strategy doc claims
- `acquireTokenSilent()` before each spawn — no custom setTimeout timer
- Read `docs/enterprise/auth-strategy.md` §4.9 and §5.4 but cross-reference against agent team findings in `project_phase1_prep.md`
