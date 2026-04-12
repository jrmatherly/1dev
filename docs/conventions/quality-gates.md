---
title: Quality Gates
icon: shield-check
---

# Quality Gates {subtitle="Five CI-enforced gates + one local-only lint advisory"}

Every PR to `main` must pass these **five CI-enforced gates**. CI (`.github/workflows/ci.yml`) enforces them in parallel; the `status` aggregator job blocks merge if any one fails. Together they run in under 2 minutes on an M-series Mac.

A sixth check — `bun run lint` — is **strongly recommended as a local-only pre-commit step** but is NOT currently enforced by CI. See the [Local-only lint advisory](#local-only-lint-advisory) section below. The plan is to promote lint to a full CI gate once the project lint-clean baseline is established; see [`docs/operations/roadmap.md`](../operations/roadmap.md) for the tracking item.

## Gate 1: `bun run ts:check`

**What:** TypeScript type-checking via `tsgo` (Go-based, faster than `tsc`).

**What it catches:** Type errors that `esbuild` (used by `electron-vite`) silently masks during bundling. `esbuild` only strips types; it doesn't check them.

**Current baseline:** 0 errors stored in `.claude/.tscheck-baseline` (reduced from 87 → 0 on 2026-04-11). A `PostToolUse` hook tracks drift on every `.ts`/`.tsx` edit. CI fails if ANY new TS error is introduced.

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

**What:** `bun:test` regression guards under `tests/regression/` plus the `services/1code-api/tests/` service test suite.

**Current count:** 15 regression guards in `tests/regression/` + 20 service test files in `services/1code-api/tests/` = **35 test files, 199 tests total** (189 pass + 10 skipped integration tests behind `INTEGRATION_TEST=1` + a docker-compose harness), ~8s total wall time.

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

## Local-only lint advisory

`bun run lint` (ESLint 10 flat config + `eslint-plugin-sonarjs` v4) is **strongly recommended as a local pre-commit check** but is NOT enforced by CI today. Reasons:

1. The project is working toward a lint-clean local baseline. Until that baseline is established, adding lint as a CI gate would block every PR on pre-existing warnings.
2. `eslint.config.mjs` suppresses ~50 rules project-wide (see file header comments for per-rule rationale) because several rules produce false positives against this Electron/React/tRPC pattern set.
3. `.vscode/settings.json` also tracks SonarLint rule suppressions matching the ESLint config — fifty rules are disabled project-wide.

**What to do locally:** Run `bun run lint` before committing any change that touches `src/`. It takes ~8s and catches a genuinely different class of issue than the other five gates (unused imports, shadowed variables, cognitive-complexity hotspots, accidental `any` widening, etc.).

**Roadmap:** Promote lint to a full CI gate once the project is lint-clean locally. Until then, it lives here as an advisory so it doesn't silently rot. Tracked in [`docs/operations/roadmap.md`](../operations/roadmap.md) as a future cleanup item.

## Running All Five (+ lint)

```bash
# CI-enforced gates (all 5 must pass for merge):
bun run ts:check && bun run build && bun test && bun audit && (cd docs && bun run build)

# Plus the local-only lint advisory (strongly recommended):
bun run lint
```

The first five match the CI parallel-job ordering (though locally they run sequentially). If you hit a failure, fix the first failing gate before moving on — later gates may depend on earlier gates' state.

## CI Enforcement

All five CI-enforced gates run as independent parallel jobs in `.github/workflows/ci.yml`. The `status` aggregator job depends on all five and blocks merge if any one fails. Branch protection requires the `status` check to pass before merge. **`bun run lint` is not one of the CI jobs** — it is a local-only advisory step (see above).

## Why Five, Not One

Each CI-enforced gate catches a different class of failure:

| Gate | Catches what no other gate catches |
|------|-----------------------------------|
| `ts:check` | Type errors that esbuild masks during bundling |
| `build` | Bundling failures, missing imports, invalid configs |
| `test` | Behavioral regressions (dead code resurrection, brand violations, shape drift) |
| `audit` | New dependency vulnerabilities introduced by a PR |
| `docs-build` | Documentation site breakage (broken links, invalid MDX) |

The local-only `bun run lint` advisory catches code-quality issues that none of the above cover (unused imports, shadowed variables, cognitive complexity, `any` widening).

Skipping any one CI gate creates a blind spot that the others cannot cover.

## SonarLint IDE vs. `bun run lint` — why they differ

The SonarLint VS Code extension (now "SonarQube for VS Code") and `bun run lint` (`eslint-plugin-sonarjs` v4) are **two different rule engines** with overlapping but non-identical coverage. They share a common ancestry (SonarSource maintains both) but diverge architecturally:

| | `bun run lint` (CLI) | SonarLint IDE extension |
|---|---|---|
| **Engine** | `eslint-plugin-sonarjs` v4.0.2 (npm package, 268 rules) | Embedded SonarSource analyzer (~700+ rules) |
| **Config** | `eslint.config.mjs` | VS Code User settings `sonarlint.rules` |
| **Rule namespace** | `sonarjs/<friendly-name>` | `typescript:S####` |
| **Authoritative?** | ✅ Yes — this is the quality gate | ❌ No — advisory noise only |

### Why SonarLint reports findings that `bun run lint` does not

There are two distinct causes:

1. **`original` rules disabled in `eslint.config.mjs`** — rules like `sonarjs/no-dead-store` (S1854), `sonarjs/unused-import` (S1128), `sonarjs/no-gratuitous-expressions` (S2589), `sonarjs/no-empty-collection` (S4158) exist in both engines, but `eslint.config.mjs` sets them `"off"` with documented rationale (false positives against Electron/React patterns). SonarLint doesn't read `eslint.config.mjs` and reports them anyway.

2. **`decorated`/`external` rules not shipped in the npm plugin** — S6582 (`prefer-optional-chain`, wraps `@typescript-eslint`), S7776 (`prefer-set-has`, wraps `eslint-plugin-unicorn`), and S7758 (`prefer-code-point`, wraps `unicorn`) exist in the full SonarSource analyzer but are **not registered** in `eslint-plugin-sonarjs` v4.0.2's `plugin-rules.js`. The IDE bundles the underlying plugins internally; the CLI does not. To see these in the CLI, you would need to add `@typescript-eslint/eslint-plugin` and `eslint-plugin-unicorn` as devDependencies and enable the rules directly.

### The `.vscode/settings.json` suppression block is silently inactive

The project tracks a 53-rule SonarLint suppression block in `.vscode/settings.json` as documentation. However, `sonarlint.rules` has `application` scope in VS Code — **workspace settings are ignored**. Each developer must copy the block into their User settings for it to take effect. See the header comment in `.vscode/settings.json` for instructions.

### What to do about SonarLint IDE findings

- **`bun run lint` is the source of truth.** If `bun run lint` passes clean, the code meets the project's lint standard.
- **SonarLint findings are advisory.** Triage them in the context of the research above — many are false positives or intentional suppressions.
- **To silence SonarLint in your IDE:** copy the `sonarlint.rules` block from `.vscode/settings.json` into your VS Code User settings (Cmd+Shift+P → "Preferences: Open User Settings (JSON)").
- **Do not add new `eslint.config.mjs` rules** just to match SonarLint. If a SonarLint-only rule catches a real issue, fix the code; don't expand the lint config to paper over IDE noise.

### Load-bearing false positives (do not suppress)

| Location | Rule | Why it must stay |
|---|---|---|
| `agents-content.tsx:196` | S4158 "teams can only be empty" | Load-bearing reminder for F3 multi-tenant UI restoration |
| `agent-diff-view.tsx:93` | S7758 `charCodeAt` in djb2 hash | djb2 is defined on UTF-16 code units; `codePointAt` would change hash output |
| `agents-mentions-editor.tsx:372,399,497,508` | S7776 on string `.slice()` results | `Set.has()` doesn't apply to strings — SonarLint misidentifies these |

## Related Conventions

- [TypeScript Check Baseline](./tscheck-baseline.md) — how the tsgo baseline file works
- [Regression Guards](./regression-guards.md) — full inventory and scaffolding workflow
- [Pinned Dependencies](./pinned-deps.md) — why specific versions are frozen
