## Why

The 1Code enterprise fork has accumulated **91 references from tracked files
into the gitignored `.scratchpad/` directory** across ~40 source files,
documentation surfaces, regression-test comments, .claude skills/agents,
GitHub workflows, OpenSpec proposals, and Serena project memories. Two
scratchpad documents hold 80% of the load: `upstream-features-inventory.md`
(42 references) and `auth-strategy-envoy-gateway.md` (31 references).

`.scratchpad/` is in `.gitignore` line 15. By construction, references to
files inside it dangle for any other clone, any CI run, any future
contributor, and any process that doesn't have the original author's local
state. The grep `git ls-files | xargs grep -l '\.scratchpad/'` returns
~40 tracked files; running the same grep against any fresh clone of this
repo returns the *same* references pointing at *no* content. This is doc
drift in its load-bearing form: the references are real but the targets
are invisible.

The corrective rule is one sentence: **tracked files must reference tracked
files**. Where the cited content is genuinely useful (the F1-F10 catalog,
the chosen auth strategy, the Phase 0 gates checklist, the four-quality-gate
contract), it needs an addressable, browsable, durable home that every
contributor can read. Where the citation was always drift (a `.scratchpad/`
mention in a regression-test comment that the test doesn't depend on), it
needs to be removed.

The fork has a starter `xyd-js` documentation scaffold staged at `docs/`
(currently untracked). `xyd-js` is a Vite-based static documentation
generator with a single-file `docs.json` config, GFM markdown content with
frontmatter, and a `xyd build` static-site output to `.xyd/build/client/`.
The starter ships with 11 placeholder pages that document xyd itself, but
its `docs.json` schema and CLI surface have been empirically validated as
forward-compatible with the latest npm `@xyd-js/cli` build (see
[design.md](design.md) "xyd-js version bump empirical validation"). The
scaffold is ~9 months stale (its pinned `@xyd-js/cli@0.1.0-xyd.197` was
published 2025-07-01) but a tested upgrade path exists to the active
2026-01-21 build channel.

This change bootstraps the staged scaffold into a working site, promotes
the five load-bearing scratchpad documents into tracked `docs/` pages,
codifies the no-scratchpad-references rule as a regression guard plus a
new capability spec, relinks every one of the 91 references, and adds a
sixth CI job that exercises `xyd build` on every PR. After this lands,
`.scratchpad/` returns to its proper role: ephemeral local-only working
notes, never cited from tracked surfaces.

## What Changes

**`docs/` becomes a tracked, working xyd-js documentation site:**

- Track all current `docs/` files in git (`docs/docs.json`,
  `docs/package.json`, `docs/openapi.json`, `docs/.gitignore`, the
  starter pages, `docs/public/`)
- Pin `@xyd-js/cli` to `0.0.0-build-1202121-20260121231224` (the npm
  `latest` dist-tag as of 2026-04-09, published 2026-01-21, ~3 months
  old at the time of this change). Lockstep with the 28 transitive
  `@xyd-js/*` siblings the cli pulls in.
- Track `docs/bun.lock` so `bun install --frozen-lockfile` reproduces
  the same 928-package transitive tree on every clone and CI run
- Rename `docs/package.json`'s `name` from `"starter"` to `"1code-docs"`
  and add `"private": true`
- Rewrite `docs/docs.json` to match the new five-tab information
  architecture (`Architecture` / `Enterprise` / `Conventions` /
  `Operations` / `API Reference`) with 1Code branding instead of the
  starter banner
- Replace `docs/public/assets/logo.svg` and `logo-dark.svg` with 1Code
  branding sourced from existing repo assets
- **DELETE** the 11 starter placeholder pages (`introduction.md`,
  `pages-and-routing.md`, `markdown.md`, `developer-content.md`,
  `icons.md`, `make-docs-yours.md`) — these document xyd itself, not
  1Code, and would confuse a contributor who clicked them expecting
  fork content. Also delete the upstream `docs/README.md` and replace
  it with a brief "this is the 1Code documentation site, run
  `cd docs && bun run build` for a static build" pointer.
- Keep `docs/openapi.json` as a placeholder for a future REST API
  surface (1Code is desktop-first today so the file is unused, but the
  starter's OpenAPI mount slot stays available)

**Five load-bearing `.scratchpad/` documents are SNAPSHOT-PROMOTED into
`docs/enterprise/`** (per Q3 Option A from the explore session):

- `.scratchpad/upstream-features-inventory.md` v2 →
  `docs/enterprise/upstream-features.md` (the F1-F10 SaaS dependency
  catalog, 42 incoming references collapse to one canonical home)
- `.scratchpad/auth-strategy-envoy-gateway.md` v2.1 →
  `docs/enterprise/auth-strategy.md` (the chosen Envoy Gateway dual-auth
  strategy, empirically validated 2026-04-08, 31 incoming references)
- `.scratchpad/enterprise-auth-integration-strategy.md` v5 →
  `docs/enterprise/auth-fallback.md` (the MSAL-in-Electron fallback,
  retained but not chosen, 5 incoming references)
- `.scratchpad/forwardaccesstoken-smoke-test.md` →
  `docs/enterprise/envoy-smoke-test.md` (the reproducible runbook for
  the dual-auth validation, 4 incoming references)
- `.scratchpad/tscheck-remediation-plan.md` →
  `docs/conventions/tscheck-baseline.md` (the 6-root-cause plan +
  appendix to `.scratchpad/tscheck-snapshot-2026-04-08.log`, 3 incoming
  references)

**The five `.scratchpad/` originals are NOT deleted by this change.**
They are preserved with a `**DEPRECATED — see [docs/...]**` banner
prepended to each, and they remain the in-flight work surface for the
three open OpenSpec changes (`add-feature-flag-infrastructure`,
`retire-mock-api-translator`, `remove-upstream-sandbox-oauth`) that
currently cite them. Once those three changes archive, a follow-up
cleanup change (out of scope here) deletes the deprecated originals.

**Eight native pages are authored from scratch** in `docs/conventions/`,
`docs/architecture/`, and the landing slot:

- `docs/introduction.md` — replaces the starter quickstart with a
  1Code-specific landing page
- `docs/architecture/upstream-boundary.md` — the rules for `remoteTrpc.*`
  and `fetch(${apiUrl}/...)` call sites, cited by the
  `upstream-boundary-check` skill
- `docs/conventions/quality-gates.md` — the four-gate contract (ts:check
  + build + test + audit), cited by CLAUDE.md and several memories
- `docs/conventions/regression-guards.md` — the six existing guards
  (after this change: seven, with the new no-scratchpad-references
  guard), cited by four `tests/regression/*.test.ts` provenance comments
- `docs/conventions/no-scratchpad-references.md` — the new rule
  codified as readable contributor guidance, with a link to the spec
- `docs/enterprise/fork-posture.md` — the "what is this fork and why"
  paragraph currently duplicated across CLAUDE.md, README.md,
  CONTRIBUTING.md, and AGENTS.md
- `docs/enterprise/phase-0-gates.md` — the 15-gate Phase 0 checklist
  currently in CLAUDE.md "Phase 0 progress" + the `phase-0-progress`
  skill
- `docs/enterprise/cluster-facts.md` — Talos cluster, Envoy Gateway
  v1.7.1, Entra tenant, echo server, and the Flux/GitOps workflow,
  consolidated from `.serena/memories/` and CLAUDE.md scattered notes

**Ten stub pages** complete the IA. Each stub is a real page with
frontmatter, a title, and a "TODO: see CLAUDE.md §X — content authoring
deferred to a follow-on change" pointer. Stubs make the sidebar render
end-to-end on day one without committing to write 23+ pages of content
in this change. The stubs are: `architecture/overview.md`,
`architecture/tech-stack.md`, `architecture/codebase-layout.md`,
`architecture/database.md`, `architecture/trpc-routers.md`,
`conventions/brand-taxonomy.md` (links to the existing brand-identity
spec), `conventions/pinned-deps.md`, `conventions/feature-flags.md`,
`operations/release.md`, `operations/debugging-first-install.md`,
`operations/env-gotchas.md`, `operations/cluster-access.md`. Authoring
each stub fully is explicitly deferred to follow-on changes — see
[Non-Goals](design.md#goals--non-goals) in the design doc.

**A new capability spec is created at
`openspec/specs/documentation-site/spec.md`** (the second capability
spec in the project, after `brand-identity`). It codifies five
SHALL/MUST requirements covering: tracked-only references, the docs/
canonical-home rule, the xyd build success contract, the exact-pin
requirement on `@xyd-js/cli`, and the lockfile-tracking rule.

**A new regression guard is added at
`tests/regression/no-scratchpad-references.test.ts`** that walks all
git-tracked files and fails the `bun test` quality gate if any of them
contains a `.scratchpad/` reference. The guard has a small file-level
allowlist for: archived OpenSpec changes under
`openspec/changes/archive/` (immutable history), the existing
`docs-drift-check` skill which legitimately *describes* `.scratchpad/`
as a concept, and CLAUDE.md's "Working Directories & Conventions"
section which describes what `.scratchpad/` is for without citing
specific files. The guard increments the regression-suite count from 6
guards / 14 tests to 7 guards / ~16 tests.

**The existing `.github/workflows/ci.yml` is extended with a sixth job**
called `docs-build` that runs `bun install --frozen-lockfile && bun run
build` from `docs/` on every PR. The job is added to the
`status` aggregator job's `needs:` list, so branch protection requiring
the single `CI Status` check automatically picks up docs builds. The
existing comment-block reference to `.scratchpad/auth-strategy-envoy-
gateway.md §6` in the workflow header is replaced with a reference to
`docs/enterprise/phase-0-gates.md`.

**91 cross-document references are relinked or removed.** The breakdown
based on the explore-mode inventory:

- 42 references to `.scratchpad/upstream-features-inventory.md` →
  relink to `docs/enterprise/upstream-features.md`
- 31 references to `.scratchpad/auth-strategy-envoy-gateway.md` →
  relink to `docs/enterprise/auth-strategy.md` (specific section
  anchors preserved where the citation calls them out — e.g.,
  `§4.9` becomes `docs/enterprise/auth-strategy.md#env-var-injection`)
- 5 references to `.scratchpad/enterprise-auth-integration-strategy.md`
  → relink to `docs/enterprise/auth-fallback.md`
- 4 references to `.scratchpad/forwardaccesstoken-smoke-test.md` →
  relink to `docs/enterprise/envoy-smoke-test.md`
- 3 references to `.scratchpad/tscheck-remediation-plan.md` → relink
  to `docs/conventions/tscheck-baseline.md`
- 3 references to `.scratchpad/rebrand-residual-audit.md` → ALREADY
  CLEANED in the prior session (the audit was the precursor to this
  proposal); these references are removed-not-relinked because the
  durable home for the brand taxonomy is the existing
  `openspec/specs/brand-identity/spec.md`
- 2 references to `.scratchpad/gate8-preliminary.md` → LEFT ALONE
  (the in-flight `remove-upstream-sandbox-oauth` change handles this
  file's archival itself, per the prior session's resolution)
- 1 reference to a non-existent `.scratchpad/something.md` → no-op
  (it was inside a risk-mitigation example sentence, not a real path)

**`.scratchpad/xyd-starter-docs/` is deleted.** It is a duplicate copy
of the starter that the user staged before promoting the same content
to `docs/`. Removing it is a single rmdir.

**Six Serena memories, CLAUDE.md, README.md, CONTRIBUTING.md, AGENTS.md,
`.claude/PROJECT_INDEX.md`, `openspec/config.yaml`, the
`.claude/settings.json` PreToolUse hook, five `.claude/skills/*`, one
`.claude/agent`, four `tests/regression/*.test.ts` provenance comments,
and three in-flight OpenSpec proposals are updated** to point at
`docs/` instead of `.scratchpad/`. The full list of touched files is
enumerated in [tasks.md](tasks.md) Phase 9.

## Capabilities

This change introduces **one new capability** and modifies **zero existing
capabilities**:

- `documentation-site` — codifies the docs-site contract: where canonical
  reference docs live, the no-scratchpad-references rule, the `xyd build`
  success guarantee, the exact-pin requirement on the xyd-js cli, and the
  lockfile tracking rule. This capability has no prior baseline, so it is
  added under `## ADDED Requirements` in `specs/documentation-site/spec.md`
  per OpenSpec 1.2.0 conventions (the `## MODIFIED Requirements` directive
  cannot apply to a capability that doesn't yet exist in
  `openspec/specs/`).

The existing `brand-identity` capability spec is NOT modified by this
change. The new `documentation-site` spec links to it (specifically, the
new `docs/conventions/brand-taxonomy.md` stub points at it as the
authoritative source for the Tier A/B/C taxonomy) but does not
re-state any of its requirements.

## Impact

**Files added (~25):**
- `openspec/changes/bootstrap-documentation-site/{proposal,design,tasks,
  README,.openspec.yaml}` (this change)
- `openspec/changes/bootstrap-documentation-site/specs/documentation-site/
  spec.md` (the new capability spec for OpenSpec to promote on archive)
- `openspec/specs/documentation-site/spec.md` (the post-archive promoted
  capability — created by `openspec archive`, not by hand)
- `docs/bun.lock` (newly tracked, generated by `bun install`)
- 13 authored docs/ pages (5 promoted snapshots + 8 native pages)
- 10 stub docs/ pages
- `tests/regression/no-scratchpad-references.test.ts`

**Files modified (~50):**
- `docs/docs.json` (full IA rewrite)
- `docs/package.json` (name, private, version pin bump)
- `docs/public/assets/logo*.svg` (1Code branding)
- `.github/workflows/ci.yml` (add docs-build job, clean comment ref)
- `CLAUDE.md` (relink references, add docs/ section to "Documentation
  Maintenance", add xyd-js to "Dependency Version Constraints")
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`
- `.claude/PROJECT_INDEX.md`
- `openspec/config.yaml` (relink the two `.scratchpad/` refs in
  `context:`)
- `.claude/settings.json` (PreToolUse hook auth-edit warning)
- 6 Serena memory files
- 5 `.claude/skills/SKILL.md` files
- 1 `.claude/agents/upstream-dependency-auditor.md`
- 4 `tests/regression/*.test.ts` provenance comments
- 3 in-flight OpenSpec proposals (`add-feature-flag-infrastructure`,
  `retire-mock-api-translator`, `remove-upstream-sandbox-oauth`)
- 5 `.scratchpad/*.md` originals (DEPRECATED banner only — content
  unchanged)

**Files deleted (12):**
- `.scratchpad/xyd-starter-docs/` (the starter duplicate, 11 files +
  one subdirectory)
- The 6 starter placeholder pages under `docs/` (`introduction.md`
  *replaced not deleted*, `pages-and-routing.md`, `markdown.md`,
  `developer-content.md`, `icons.md`, `make-docs-yours.md`)

**Quality gates after this change:**
- `bun run ts:check` baseline: still 88 (this change does not touch
  TypeScript)
- `bun run build`: still passes (this change does not touch the Electron
  app)
- `bun test`: 7 guards / 16 tests (was 6/14 — adds the no-scratchpad-
  references guard with 2 expect calls)
- `bun audit`: still no new advisories beyond the ~57 pre-existing
  transitive ones
- **NEW:** `cd docs && bun run build` exits 0 in ~4 minutes, produces
  ~6.2 MB of static output to `docs/.xyd/build/client/`. CI runs this
  as a sixth parallel job alongside the existing four; the `status`
  aggregator job depends on all five.

**Coordination cost:** The three in-flight OpenSpec proposals each cite
`.scratchpad/` paths in their proposal/design/tasks. After this change
lands, those three proposals get a one-task patch each (Phase 14 in
[tasks.md](tasks.md)) updating the citations to point at `docs/`. This
is doc-only and non-blocking — the in-flight implementations don't need
to wait.

**Reversibility:** HIGH. The change touches no application code, no
schema, no migrations, and no runtime behavior. Worst case, the docs/
site is reverted, the regression guard is removed, and the 91
references are restored from git history. The five .scratchpad/
originals are preserved with deprecation banners (not deleted) so
nothing in the in-flight work loses its source.

**Blast radius:** LARGE in file count (~50 modified, ~25 added, 12
deleted) but MECHANICAL. Every individual edit is a relink or a content
copy. There is no algorithmic logic, no concurrency consideration, no
SQL migration. Each task in [tasks.md](tasks.md) is independently
verifiable.
