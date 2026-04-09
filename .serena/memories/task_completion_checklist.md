# Task Completion Checklist

## Required — All Quality Gates
1. `bun run ts:check` — baseline 88 errors (`.claude/.tscheck-baseline`), only fail if count increases
2. `bun run build` — electron-vite build
3. `bun test` — 8 guards, 25 tests under `tests/regression/`
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
- 4 capability specs in `openspec/specs/`: `brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`

## Phase 0 Status (12 of 15 complete)
- ✅ #1-7, #9-15 — done
- ⏳ **#8 — upstream sandbox OAuth extraction** (only remaining gate, tracked by `remove-upstream-sandbox-oauth` change)
