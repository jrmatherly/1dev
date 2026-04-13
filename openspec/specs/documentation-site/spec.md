# documentation-site Specification

## Purpose

This capability codifies the rules for the 1Code enterprise fork's
canonical documentation site at `docs/` and the no-scratchpad-references
contract that protects against documentation drift between tracked
surfaces and gitignored working notes.

The capability has two enforcement surfaces: a regression guard at
`tests/regression/no-scratchpad-references.test.ts` that runs as part
of the four-quality-gate `bun test` contract, and a CI job at
`.github/workflows/ci.yml` that runs `xyd build` from `docs/` on every
PR. Both surfaces are required.
## Requirements
### Requirement: Tracked files MUST NOT reference .scratchpad/ paths

The system SHALL NOT allow any tracked file in the repository to contain
a literal reference to a path under `.scratchpad/`. The directory
`.scratchpad/` is gitignored and serves as the local-only working-notes
surface for in-flight strategy work; references to its contents from
tracked files create dangling pointers for any clone, contributor, or
CI run that does not have the original author's local state.

A "tracked file" is any file returned by `git ls-files` from the
repository root.

A "reference" is any line containing the literal substring `.scratchpad/`
(including the trailing slash). Prose mentions of "scratchpad" without
the literal `.scratchpad/` substring are NOT references and are
permitted.

The following files are exempt from this requirement (the allowlist):

- `.gitignore` — contains the literal `.scratchpad/` rule that gitignores
  the directory itself
- `CLAUDE.md` — the "Working Directories & Conventions" section
  describes `.scratchpad/` as a concept without citing specific files
- `.claude/skills/docs-drift-check/SKILL.md` — the docs-drift-check
  skill performs drift audits against `.scratchpad/` content and must
  reference the directory as part of its scan logic
- `tests/regression/no-scratchpad-references.test.ts` — the regression
  guard itself contains the literal `.scratchpad/` substring in its
  detection regex
- `openspec/changes/archive/**` — archived OpenSpec changes are
  immutable historical records that may cite `.scratchpad/` files that
  existed at archive time; archived changes SHALL NOT be edited to
  remove historical references

#### Scenario: Regression guard rejects a new .scratchpad/ reference in tracked code

- **WHEN** a contributor commits a change that adds a line containing
  the literal substring `.scratchpad/` to any tracked file outside the
  allowlist
- **THEN** the `bun test` quality gate SHALL fail with a
  no-scratchpad-references regression-guard error
- **AND** the error message SHALL name the offending file path and
  line number
- **AND** the error message SHALL provide an actionable next step
  ("relink the reference to the corresponding `docs/` page, or remove
  the citation if it was always drift")
- **AND** the commit SHALL be blocked from merging until the offending
  reference is removed or the file is added to the allowlist

#### Scenario: Allowlisted file may contain .scratchpad/ references

- **WHEN** the regression guard scans `.gitignore`, `CLAUDE.md`,
  `.claude/skills/docs-drift-check/SKILL.md`,
  `tests/regression/no-scratchpad-references.test.ts`, or any file
  under `openspec/changes/archive/**`
- **THEN** the regression guard SHALL treat any `.scratchpad/`
  occurrence in those files as an allowed reference
- **AND** the scan SHALL not fail on those occurrences

#### Scenario: Prose mention of "scratchpad" without the literal path is permitted

- **WHEN** a tracked file contains the word "scratchpad" in prose (e.g.,
  "see the scratchpad directory for ephemeral notes") without the
  literal substring `.scratchpad/`
- **THEN** the regression guard SHALL not flag the occurrence
- **AND** the file is not required to be on the allowlist

### Requirement: Canonical reference documentation SHALL live under docs/

The system SHALL maintain the `docs/` directory as the canonical home
for fork documentation that contributors and AI agents reference as
source-of-truth. CLAUDE.md, README.md, CONTRIBUTING.md, AGENTS.md,
.serena/memories/, and .claude/PROJECT_INDEX.md SHALL link to `docs/`
pages for any architectural fact, migration narrative, contributor
convention, or runbook content that has a canonical home in `docs/`.

A "canonical home" is established when a `docs/` page is authored
(not stubbed) and contains the durable version of content that was
previously scattered across multiple tracked surfaces. The five
promoted pages (`docs/enterprise/upstream-features.md`,
`docs/enterprise/auth-strategy.md`, `docs/enterprise/auth-fallback.md`,
`docs/enterprise/envoy-smoke-test.md`,
`docs/conventions/tscheck-baseline.md`) are canonical homes by
construction once they land.

CLAUDE.md and the other tracked surfaces SHALL NOT duplicate the full
content of any `docs/` page. They MAY contain a brief summary plus a
link to the canonical `docs/` page.

#### Scenario: CLAUDE.md links to docs/ for the F1-F10 catalog

- **WHEN** a contributor reads CLAUDE.md "Fork posture" or "Phase 0
  progress" sections
- **THEN** the section SHALL contain a link to
  `docs/enterprise/upstream-features.md` for the full F1-F10 SaaS
  dependency catalog
- **AND** the section SHALL NOT contain the full F1-F10 table itself
- **AND** the link target SHALL be a tracked file under `docs/`

#### Scenario: A new architectural fact is added to docs/, not CLAUDE.md

- **WHEN** a contributor needs to document a new architectural fact
  (e.g., a new Drizzle table, a new tRPC router pattern, a new
  cluster-side decision)
- **THEN** the contributor SHALL author or update the corresponding
  `docs/` page
- **AND** SHALL update CLAUDE.md to point at the new `docs/` content
  if a CLAUDE.md section previously covered the same topic
- **AND** SHALL NOT duplicate the full new content in both surfaces

### Requirement: docs/ SHALL build successfully via xyd build

The system SHALL maintain `docs/` as a working xyd-js documentation
site that builds reproducibly without errors via
`cd docs && bun install --frozen-lockfile && bun run build`. The build
SHALL produce a static site at `docs/.xyd/build/client/` containing the
rendered HTML, JavaScript, CSS, and asset files for every page in
`docs/docs.json`'s sidebar configuration.

The build SHALL be exercised on every pull request to `main` via a
`docs-build` job in `.github/workflows/ci.yml`. The job SHALL run in
parallel with the existing `ts-check`, `build`, `test`, and `audit`
jobs and SHALL be a dependency of the `status` aggregator job that
branch protection uses.

#### Scenario: PR adds a docs page that references a missing image

- **WHEN** a contributor adds a markdown page under `docs/` that
  references a missing image at `/public/missing.png`
- **THEN** the `docs-build` CI job SHALL fail at the `bun run build`
  step
- **AND** the `status` aggregator job SHALL fail because of the
  upstream `docs-build` failure
- **AND** branch protection SHALL block the PR from merging

#### Scenario: PR adds a sidebar entry pointing at a non-existent page

- **WHEN** a contributor adds a `"pages"` entry to `docs/docs.json`
  that references a slug with no corresponding markdown file
- **THEN** the `docs-build` CI job SHALL fail at the `bun run build`
  step with a 404 or routing error
- **AND** the PR SHALL be blocked from merging

#### Scenario: Local docs build matches CI docs build

- **WHEN** a contributor runs `cd docs && bun install --frozen-lockfile
  && bun run build` locally on a fresh clone
- **THEN** the build SHALL exit 0
- **AND** the build SHALL produce identical output structure to a CI
  run on the same commit
- **AND** the build SHALL complete in under 10 minutes on M-series Mac
  hardware

### Requirement: @xyd-js/cli SHALL be pinned exactly with no caret or tilde

The system SHALL pin `@xyd-js/cli` in `docs/package.json` to an exact
version string (no caret `^`, no tilde `~`, no version range). The
xyd-js project publishes pre-release builds in lockstep across 28
sibling `@xyd-js/*` packages, and version strings include build SHA
and timestamp components (e.g.,
`0.0.0-build-1202121-20260121231224`); semver range operators do not
provide useful upgrade safety in this naming scheme and would risk
mixing version channels.

A "version channel" is a release naming pattern. The xyd-js cli has
historically used three channels: `0.1.0-pre.<N>`, `0.1.0-xyd.<N>`,
and `0.0.0-build-<sha>-<timestamp>`. As of 2026-04-09, only the third
channel is actively published. Mixing channels (e.g., a cli on the
`build` channel with `@xyd-js/host` on the `xyd` channel) is unsafe and
SHALL NOT be allowed.

Bumping the pin SHALL follow the `verify-pin` skill workflow at
`.claude/skills/verify-pin/SKILL.md`, which requires: (a) checking the
npm `latest` dist-tag, (b) sandbox install + `xyd build` in a temp
directory, (c) `bun audit` against the new tree, (d) verifying
`docs/docs.json` schema compatibility, and (e) updating
`docs/conventions/pinned-deps.md` with the new pin and validation date.

#### Scenario: package.json contains an exact xyd-js cli version

- **WHEN** a contributor reads `docs/package.json`
- **THEN** the `dependencies."@xyd-js/cli"` field SHALL be a string
  exactly matching a published npm version
- **AND** the string SHALL NOT begin with `^` or `~`
- **AND** the string SHALL NOT contain `||`, `>=`, `<=`, `>`, or `<`

#### Scenario: PR bumps xyd-js cli without sandbox validation

- **WHEN** a contributor opens a PR that changes
  `docs/package.json`'s `@xyd-js/cli` pin
- **THEN** the PR description SHALL reference the verify-pin skill
  workflow run that validated the new pin
- **AND** the PR SHALL include an updated entry in
  `docs/conventions/pinned-deps.md` documenting the new pin and the
  validation evidence
- **AND** if the validation evidence is missing, the PR review SHALL
  block the merge until it is provided

### Requirement: docs/bun.lock SHALL be tracked in git

The system SHALL track `docs/bun.lock` (or `docs/bun.lockb`, whichever
format `bun install` produces in the current bun version) as a
committed file. The lockfile guarantees that the 928-package transitive
dependency tree under `docs/node_modules/` resolves to identical
versions across contributors, CI runs, and time.

The CI `docs-build` job SHALL invoke `bun install --frozen-lockfile`,
not bare `bun install`, so that any drift between `docs/package.json`
and `docs/bun.lock` causes a loud CI failure rather than a silent
re-resolution.

#### Scenario: docs/bun.lock is committed to the repository

- **WHEN** a contributor runs `git ls-files docs/bun.lock`
- **THEN** the command SHALL output the file path
- **AND** the file SHALL exist in the working tree
- **AND** the file SHALL match the resolution of
  `docs/package.json`'s declared dependencies

#### Scenario: PR modifies package.json without updating the lockfile

- **WHEN** a contributor opens a PR that changes `docs/package.json`
  but does not update `docs/bun.lock`
- **THEN** the `docs-build` CI job SHALL fail at the
  `bun install --frozen-lockfile` step with a "lockfile out of sync"
  error
- **AND** the PR SHALL be blocked from merging until the lockfile is
  regenerated and committed

#### Scenario: Fresh clone reproduces the exact dependency tree

- **WHEN** a contributor performs a fresh `git clone` followed by
  `cd docs && bun install --frozen-lockfile`
- **THEN** the resolved `docs/node_modules/` tree SHALL contain the
  identical 28 sibling `@xyd-js/*` packages at the same version
  string as the original author's tree
- **AND** the `bun install` SHALL exit 0

### Requirement: Phase 0 gates page accuracy
The `docs/enterprise/phase-0-gates.md` page SHALL reflect the current Phase 0 gate status (15/15 complete). The subtitle and table SHALL match the actual gate completion state.

#### Scenario: Subtitle matches reality
- **WHEN** a reader opens `docs/enterprise/phase-0-gates.md`
- **THEN** the subtitle says "15 of 15 complete" (not "12 of 15")

### Requirement: Quality gates documentation accuracy
The `docs/conventions/quality-gates.md` page SHALL reflect the current TS baseline (0 errors). Historical baseline values SHALL not appear as current state.

#### Scenario: Baseline reflects current state
- **WHEN** a reader opens `docs/conventions/quality-gates.md`
- **THEN** the TS baseline is documented as 0, not ~87 or any other stale value

### Requirement: Architecture doc completeness
The architecture documentation pages under `docs/architecture/` SHALL contain substantive content, not stub placeholders. Content already exists in CLAUDE.md and Serena memories and SHALL be migrated to the canonical pages.

#### Scenario: No stub pages
- **WHEN** a reader navigates to any page under `docs/architecture/`
- **THEN** the page contains meaningful content (not just a title and "TODO" marker)

### Requirement: Upstream features doc accuracy
The `docs/enterprise/upstream-features.md` page SHALL use the current brand domain (`apollosai.dev`), not stale `21st.dev` references.

#### Scenario: No stale brand references
- **WHEN** `docs/enterprise/upstream-features.md` is searched for `21st.dev`
- **THEN** zero matches are found

