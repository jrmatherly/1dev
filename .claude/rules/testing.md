---
paths:
  - "tests/**"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Testing rules — TDD red-state, regression guards, quality gates

This repo uses **`bun:test`** (built-in, no config) for regression guards. There is no Jest/Vitest/Playwright in the tree. Broader test adoption is part of Phase 0 hard gate #11.

## TDD red-state verification rule

A test that fails because of a **missing import, undefined symbol, or TypeScript compile error is NOT a valid red.**

- The red step must produce an **assertion failure** with a readable `expected X, got Y` message.
- If the red output mentions `ReferenceError`, `TypeError`, or `Cannot find module`, **stop and fix the test harness** before proceeding to green.
- If you can't get a valid red, the test is unverifiable and must not be committed.

## Regression guard requirements

Any new guard under `tests/regression/`:

1. **Side-effect free** — only reads files, never writes
2. **<200ms** on a warm filesystem
3. **No network access** — all checks are local
4. **No bun-specific path dependencies** — use `bun:test` imports + `node:fs`/`node:path` only
5. **Cite source** — guard docstring must link to the motivating OpenSpec change or Phase 0 gate
6. **Updated surfaces** — when adding a new guard, update `docs/conventions/regression-guards.md` (canonical list) and CLAUDE.md / PROJECT_INDEX.md / Serena memories if they cite a count

Use the `new-regression-guard` skill via `/new-regression-guard` to scaffold a new guard.

## Quality gates (before every PR)

Run these **five CI-enforced gates** before submitting a PR — **none is a superset of the others**:

```bash
bun run ts:check      # tsgo-based, stricter than tsc
bun run build         # esbuild, validates packaging
bun test              # regression guards + 1code-api tests (~8s)
bun audit             # dependency advisories
cd docs && bun run build  # xyd-js site builds cleanly
```

All five are enforced in `.github/workflows/ci.yml` as independent parallel jobs (including `docs-build`). The `CI Status` aggregator job blocks merge if any one fails.

### Local-only lint advisory

Additionally, run `bun run lint` (ESLint + `eslint-plugin-sonarjs`, ~8s) locally before committing. It catches unused imports, shadowed variables, cognitive-complexity hotspots, and accidental `any` widening that the five CI gates do not cover.

**`bun run lint` is NOT currently enforced by CI.** The project is working toward a lint-clean local baseline before promoting lint to a full CI gate. Until then, treat it as a mandatory local step but expect CI to be silent about it. Tracked in `docs/operations/roadmap.md` as a cleanup item.

See `docs/conventions/quality-gates.md` for the canonical description of each gate and the lint advisory.

## TypeScript baseline

`bun run ts:check` currently reports ~87 pre-existing errors on `main`. Before investigating any TS error:

```bash
git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop
```

Only worry about **new** errors your changes introduce. A PostToolUse hook in `.claude/settings.json` reads `.claude/.tscheck-baseline` and fails loudly if the count increases after a `.ts`/`.tsx` edit.

If you legitimately reduce the baseline:
```bash
bun run ts:check 2>&1 | grep -c "error TS" > .claude/.tscheck-baseline
```

## Related canonical docs

- `docs/conventions/quality-gates.md` — full quality gate list
- `docs/conventions/regression-guards.md` — guard catalog
- `docs/conventions/tscheck-baseline.md` — baseline mechanics
