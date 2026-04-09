---
title: Four Quality Gates
icon: shield-check
---

# Four Quality Gates {subtitle="None is a superset of the others — all four are required"}

Every PR to `main` must pass these four gates. CI (`.github/workflows/ci.yml`) enforces them in parallel; the `status` aggregator job blocks merge if any one fails. Together they run in under 2 minutes on an M-series Mac.

## Gate 1: `bun run ts:check`

**What:** TypeScript type-checking via `tsgo` (Go-based, faster than `tsc`).

**What it catches:** Type errors that `esbuild` (used by `electron-vite`) silently masks during bundling. `esbuild` only strips types; it doesn't check them.

**Current baseline:** ~88 pre-existing errors stored in `.claude/.tscheck-baseline`. A PostToolUse hook tracks drift on every `.ts`/`.tsx` edit. Only fail if the count *increases*.

**Distinguish your errors from baseline:**
```bash
git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop
```

**Requires:** `npm install -g @typescript/native-preview`

## Gate 2: `bun run build`

**What:** Full `electron-vite` build (main + preload + renderer).

**What it catches:** Bundling failures, missing imports, invalid configurations. Produces the actual packaging artifact.

## Gate 3: `bun test`

**What:** `bun:test` regression guards under `tests/regression/`.

**Current count:** 7 guards, ~16 tests, ~40 expect calls, ~200ms total.

**What it catches:** Re-introduction of deleted dead code, token leaks, brand violations, credential manager resurrection, GPG verification removal, feature flag shape changes, and `.scratchpad/` reference leaks.

See [Regression Guards](./regression-guards.md) for the full inventory.

## Gate 4: `bun audit`

**What:** Dependency vulnerability scan.

**Current state:** ~57 pre-existing transitive dev-dep advisories (picomatch, tinyglobby, @electron/rebuild chain). Focus on whether the count *increased*, not on absolute zero.

## Running All Four

```bash
bun run ts:check && bun run build && bun test && bun audit
```

## Docs Build (5th gate in CI)

CI also runs `xyd build` against `docs/` as a parallel job. This gate validates that the documentation site builds without errors. It is not required locally but is recommended:

```bash
cd docs && bun install --frozen-lockfile && bun run build
```
