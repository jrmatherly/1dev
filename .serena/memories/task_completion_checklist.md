# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — baseline 45 errors (`.claude/.tscheck-baseline`, improved from 80 → 63 → 54 → 45 via successive SonarLint remediation + Cluster A `DiffStateContextValue` type fix 2026-04-10), only fail if count increases
2. `bun run build` — electron-vite build
3. `bun test` — 14 regression guards + 5 service tests = 75 tests across 19 files
4. `bun audit` — focus on NEW advisories only
5. CI also runs `cd docs && bun run build` — recommended locally too

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

## Before Committing
- No `.env` files or secrets staged
- No `console.log` debugging left behind
- Run `/docs-drift-check` skill if you touched schema, routers, version pins, or any doc surface. The skill catalog of drift points lives in `.claude/skills/docs-drift-check/SKILL.md`.
- Verify `docs/conventions/pinned-deps.md` accuracy before touching version-sensitive code
- Grep for actual imports (ground truth) rather than trusting research patterns alone

## OpenSpec Workflow (for larger changes)
1. `/opsx:propose <description>` — create change with all artifacts
2. `/opsx:apply <name>` — implement tasks
3. `/opsx:archive <name>` — archive and promote capability specs
- 9 capability specs in `openspec/specs/`: `brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`, `credential-storage`, `renderer-data-access`, `enterprise-auth`, `enterprise-auth-wiring`, `electron-runtime`
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
