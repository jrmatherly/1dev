---
title: Five Quality Gates
icon: shield-check
---

# Five Quality Gates {subtitle="None is a superset of the others — all five are required"}

Every PR to `main` must pass these five gates. CI (`.github/workflows/ci.yml`) enforces them in parallel; the `status` aggregator job blocks merge if any one fails. Together they run in under 2 minutes on an M-series Mac.

## Gate 1: `bun run ts:check`

**What:** TypeScript type-checking via `tsgo` (Go-based, faster than `tsc`).

**What it catches:** Type errors that `esbuild` (used by `electron-vite`) silently masks during bundling. `esbuild` only strips types; it doesn't check them.

**Current baseline:** ~87 pre-existing errors stored in `.claude/.tscheck-baseline`. A `PostToolUse` hook tracks drift on every `.ts`/`.tsx` edit. Only fail if the count *increases*.

**Distinguish your errors from baseline:**
```bash
git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop
```

**Requires:** `npm install -g @typescript/native-preview`

See also: [TypeScript Check Baseline](./tscheck-baseline.md).

## Gate 2: `bun run build`

**What:** Full `electron-vite` build (main + preload + renderer).

**What it catches:** Bundling failures, missing imports, invalid configurations. Produces the actual packaging artifact.

## Gate 3: `bun test`

**What:** `bun:test` regression guards under `tests/regression/`.

**Current count:** 13 guards, 53 tests, ~119 expect calls, ~2.5s total wall time.

**What it catches:** Re-introduction of deleted dead code, token leaks, brand violations, credential manager resurrection, GPG verification removal, feature flag shape changes, upstream sandbox OAuth, `.scratchpad/` reference leaks, mock-api snake_case timestamps, credential storage tier policy, enterprise auth module shape, and Electron version pin drift.

See [Regression Guards](./regression-guards.md) for the full inventory with per-guard motivations.

## Gate 4: `bun audit`

**What:** Dependency vulnerability scan via Bun's built-in advisory database.

**Current state:** Pre-existing transitive dev-dep advisories exist (picomatch, tinyglobby, @electron/rebuild chain). Focus on whether the count *increased*, not on absolute zero.

## Gate 5: `cd docs && bun run build`

**What:** `xyd-js` documentation site build against `docs/`.

**What it catches:** Broken internal links, missing tab files, malformed frontmatter, invalid MDX syntax, and unreachable navigation entries. Validates that the canonical documentation site still deploys.

**Pinned version:** `@xyd-js/cli` at `0.0.0-build-1202121-20260121231224` — xyd-js publishes pre-release builds in lockstep across 28 sibling packages. Bumping requires the `verify-pin` skill.

**Reproducible install:** `docs/bun.lock` is tracked for CI reproducibility.

## Running All Five

```bash
bun run ts:check && bun run build && bun test && bun audit && (cd docs && bun run build)
```

This command ordering matches the CI parallel-job ordering (though locally they run sequentially). If you hit a failure, fix the first failing gate before moving on — later gates may depend on earlier gates' state.

## CI Enforcement

All five gates run as independent parallel jobs in `.github/workflows/ci.yml`. The `status` aggregator job depends on all five and blocks merge if any one fails. Branch protection requires the `status` check to pass before merge.

## Why Five, Not One

Each gate catches a different class of failure:

| Gate | Catches what no other gate catches |
|------|-----------------------------------|
| `ts:check` | Type errors that esbuild masks during bundling |
| `build` | Bundling failures, missing imports, invalid configs |
| `test` | Behavioral regressions (dead code resurrection, brand violations, shape drift) |
| `audit` | New dependency vulnerabilities introduced by a PR |
| `docs-build` | Documentation site breakage (broken links, invalid MDX) |

Skipping any one gate creates a blind spot that the others cannot cover.

## Related Conventions

- [TypeScript Check Baseline](./tscheck-baseline.md) — how the tsgo baseline file works
- [Regression Guards](./regression-guards.md) — full inventory and scaffolding workflow
- [Pinned Dependencies](./pinned-deps.md) — why specific versions are frozen
