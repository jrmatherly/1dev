# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — baseline 87 errors (`.claude/.tscheck-baseline`), only fail if count increases
2. `bun run build` — electron-vite build
3. `bun test` — 10 guards, 36 tests under `tests/regression/`
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
- 5 capability specs in `openspec/specs/`: `brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`, `credential-storage`

## Phase 0 Status (15 of 15 complete ✅)
All gates closed. Phase 0.5 (harden-credential-storage) also complete.

## If Editing Credential Code
- All encryption MUST go through `src/main/lib/credential-store.ts`
- Do NOT add `safeStorage.encryptString/decryptString` calls in any other file
- PreToolUse hook blocks violations; regression guard catches in CI
