## Context

The 1Code enterprise fork has reached a documentation crisis specific to
its fork posture. The original upstream `21st-dev/1code` repository was
not migrated to a hosted documentation site, so all architectural,
operational, and migration-strategy knowledge has historically lived in:

1. **`CLAUDE.md`** at the repo root (the AI-and-human onboarding doc)
2. **`README.md`**, **`CONTRIBUTING.md`**, **`AGENTS.md`** (contributor
   surfaces)
3. **`.serena/memories/*.md`** (six tracked Serena project memories
   that AI agents read on activation)
4. **`.claude/PROJECT_INDEX.md`** (auto-generated repo navigation map)
5. **`.scratchpad/*.md`** (gitignored working documents — the original
   purpose was ephemeral local notes for in-flight strategy work)
6. **`.full-review/*.md`** (gitignored review artifacts from the
   `comprehensive-review:full-review` plugin)

Surfaces 1–4 are tracked. Surfaces 5–6 are gitignored. The drift problem
emerged because **load-bearing strategy work landed in `.scratchpad/`
during the enterprise migration design phase, and tracked surfaces
started citing it**. Specifically:

- The Phase 0 hard-gate text lives in `.scratchpad/auth-strategy-envoy-
  gateway.md` §6 — referenced from CLAUDE.md, three Serena memories,
  the `.github/workflows/ci.yml` header comment, the `.github/
  dependabot.yml` header comment, four `.claude/skills/`, one
  `.claude/agents/`, and the `add-feature-flag-infrastructure`
  proposal.
- The F1-F10 SaaS catalog lives in `.scratchpad/upstream-features-
  inventory.md` v2 — referenced from CLAUDE.md (3 sites), README.md
  (2), CONTRIBUTING.md, AGENTS.md, `.claude/PROJECT_INDEX.md` (3), 5 of
  6 Serena memories, 4 OpenSpec proposals, 2 source-file comments, 5
  `.claude/skills/`, 1 `.claude/agents/`, and `openspec/config.yaml`
  (2 sites). 42 references total.
- The empirical Envoy Gateway smoke test lives in
  `.scratchpad/forwardaccesstoken-smoke-test.md` — referenced from
  CLAUDE.md, two Serena memories, and the `verify-strategy-compliance`
  skill.

A grep `git ls-files | xargs grep -l '\.scratchpad/'` returns 40 tracked
files containing 91 reference lines. Every single one of those lines
points at content invisible to anyone who isn't the original author.

The user discovered this in the prior session when proposing to relink
three references during a smaller scratchpad-archival cleanup, and
corrected the relink approach with the rule **"we should not be
referencing documentation in the .scratchpad/ directory — that directory
is not tracked by git, and should not be"**. The corrective rule is
codified in this session's `feedback_scratchpad_references.md` user
memory.

The fix needs three parts:
1. **A durable home** for the load-bearing scratchpad content. Not
   "moved" — *promoted*, with the original source preserved during
   in-flight work.
2. **A regression guard** that catches future attempts to add new
   `.scratchpad/` references in tracked files.
3. **A capability spec** that codifies the rule and makes it part of
   the project's normative contract.

The user staged a fresh `xyd-js` documentation starter at `docs/` (still
untracked) as part of the exploration. xyd-js is a Vite-based static
documentation generator from livesession (`xyd-js/starter` on GitHub)
with a single-file `docs.json` config, GFM markdown content with YAML
frontmatter, and a `xyd build` static-site output. The starter is
flat-layout (pages live next to `docs.json`, no `src/` or `pages/`
nesting) and supports xyd's writing-framework directives (`{toc}`,
`:::callout`, `@uniform()`, `@let()`) plus standard GFM.

This change uses xyd-js as the publishing surface and frames the docs/
site as the **first canonical home** for fork documentation.

```
                  ┌──────────────────────────────────────────┐
                  │           BEFORE — drift state           │
                  └──────────────────────────────────────────┘

  CLAUDE.md ─┐
  README.md ─┤        ╔═══════════════════════════════════════╗
  AGENTS.md ─┤        ║       .scratchpad/ (gitignored)       ║
  Serena ─────┤   ──► ║                                       ║
  .claude/skills/┤   ──► ║   upstream-features-inventory.md    ║
  .claude/agents/┤   ──► ║   auth-strategy-envoy-gateway.md    ║
  src/×2 (comments)┤   ──► ║   forwardaccesstoken-smoke-test.md ║
  tests/×4 (comments)┤   ──► ║   tscheck-remediation-plan.md      ║
  openspec/×6 ─┤   ──► ║   ...                                 ║
  .github/×2 ──┘        ║                                       ║
                        ╚═══════════════════════════════════════╝
                    91 reference lines → invisible to other clones

                  ┌──────────────────────────────────────────┐
                  │            AFTER — sourced state         │
                  └──────────────────────────────────────────┘

  CLAUDE.md ─┐
  README.md ─┤        ┌───────────────────────────────────────┐
  AGENTS.md ─┤        │       docs/ (tracked, browsable,      │
  Serena ─────┤   ──► │       built by xyd, hosted later)     │
  .claude/skills/┤   ──► │                                       │
  .claude/agents/┤   ──► │   enterprise/upstream-features.md    │
  src/×2 (comments)┤   ──► │   enterprise/auth-strategy.md        │
  tests/×4 (comments)┤   ──► │   enterprise/envoy-smoke-test.md     │
  openspec/×6 ─┤   ──► │   conventions/tscheck-baseline.md    │
  .github/×2 ──┘        │   ...                                 │
                        └───────────────────────────────────────┘

                  .scratchpad/ retained for ephemeral notes only
                  (never cited from tracked files — enforced by guard)
```

## Goals / Non-Goals

**Goals:**
1. Make `docs/` a tracked, working xyd-js documentation site that builds
   reproducibly via `cd docs && bun install --frozen-lockfile && bun run
   build` and produces a browsable static site at
   `docs/.xyd/build/client/`.
2. Promote the five load-bearing `.scratchpad/` documents into addressable
   `docs/enterprise/` and `docs/conventions/` pages as snapshots, while
   preserving the originals with DEPRECATED banners until in-flight work
   closes.
3. Establish the IA shape (`Architecture` / `Enterprise` / `Conventions`
   / `Operations` / `API Reference`) so the sidebar renders end-to-end
   with no broken links on day one.
4. Codify the rules (no scratchpad references, docs/ canonical home,
   xyd build success contract, exact-pin xyd-js cli, lockfile tracked)
   as a new `documentation-site` capability spec under
   `openspec/specs/`.
5. Add a regression guard that fails the `bun test` quality gate if any
   tracked file regains a `.scratchpad/` reference outside the small
   allowlist.
6. Extend `.github/workflows/ci.yml` with a `docs-build` job so the
   docs site can never silently break on `main`.
7. Bump `@xyd-js/cli` from the 9-month-stale `0.1.0-xyd.197` pin to the
   current `0.0.0-build-1202121-20260121231224` (npm `latest` dist-tag,
   published 2026-01-21), with empirical validation that the docs.json
   schema is forward-compatible.
8. Relink all 91 cross-document references to point at `docs/` pages
   instead of `.scratchpad/` paths. Where the citation was always drift,
   remove it.

**Non-Goals (explicit — out of scope for this change):**
1. **Authoring full content for the 10 stub pages.** The stubs land as
   real pages with frontmatter and a "TODO: see CLAUDE.md §X" pointer.
   Promoting them to fully authored content is follow-on work, one
   change per stub or per logical group.
2. **Hosting / CDN / DNS for the published docs site.** `xyd build`
   produces static files. Where they get deployed (apollosai.dev/docs?
   Cloudflare Pages? netlify? GitHub Pages?) is a separate decision
   requiring infrastructure work that doesn't belong in a documentation
   bootstrap change.
3. **Search infrastructure beyond xyd defaults.** xyd ships with
   `@xyd-js/plugin-orama` and `@xyd-js/plugin-algolia` as transitive
   dependencies; configuring either is follow-on work.
4. **Replacing CLAUDE.md / README.md / CONTRIBUTING.md / AGENTS.md /
   Serena memories.** Those stay as-is in shape. They get *thinner*
   because they no longer carry source-of-truth content for facts that
   now live in `docs/` — but they remain the entry points for
   contributors and AI agents and continue to live at the repo root /
   .serena/memories/ per their existing role.
5. **Touching the content of the five `.scratchpad/` originals being
   promoted.** Only a DEPRECATED banner is prepended. The originals
   remain in their current shape until the three in-flight OpenSpec
   changes (which cite them) finish landing. A follow-on cleanup change
   then deletes the originals.
6. **`@xyd-js/cli` version upgrades beyond `0.0.0-build-1202121-
   20260121231224`.** That version is the empirically validated pin
   for this change. A future bump becomes its own change following the
   `verify-pin` skill workflow.
7. **CI branch protection rule changes on GitHub.** Adding the
   `docs-build` job to the existing `status` aggregator job is enough;
   the existing branch protection (requiring `CI Status` to pass)
   automatically picks up the new job through the aggregator.
8. **Migrating `.full-review/` content** the same way. `.full-review/`
   is also gitignored but is rarely referenced from tracked files (the
   only refs are in CLAUDE.md "evidence anchors" which the user has
   tolerated historically). Cleaning `.full-review/` references is
   out of scope here.

## Decisions

### Decision 1 — IA shape: 5 sidebar tabs

**Decision:** The xyd sidebar has exactly five tabs, in this order:

```
Architecture | Enterprise | Conventions | Operations | API Reference
```

**Why:**
- **Architecture** — what the codebase is. Mirrors CLAUDE.md's
  "Architecture" tree section. Audience: a contributor onboarding to
  the codebase.
- **Enterprise** — the migration narrative. Where the four scratchpad
  promotions land plus the fork-posture / Phase 0 / cluster-facts
  pages. Audience: anyone who needs to understand what this fork is
  doing differently from upstream.
- **Conventions** — the rules a contributor needs to follow. Where the
  quality-gates, regression-guards, and no-scratchpad-references pages
  live. Audience: a contributor about to commit a change.
- **Operations** — runbooks. Release pipeline, first-install debugging,
  cluster access, environment gotchas. Audience: someone running the
  app or operating the surrounding infrastructure.
- **API Reference** — auto-generated from `docs/openapi.json`. Audience:
  future. Today 1Code does not expose a public REST API, but the
  starter ships with the OpenAPI mount slot, so we keep it as
  scaffolding for a future REST surface. Cost: zero. Benefit: not
  having to re-add it later.

**Alternative considered:** 4 tabs, collapsing Operations into
Conventions. Rejected because runbooks are for *operators* (people
running the app or the cluster), not *contributors* (people writing
code). Mixing them would create a "what's a rule vs. what's a
procedure" classification problem on every new page.

**Alternative considered:** 6 tabs, splitting Enterprise into
"Migration" and "Cluster". Rejected as premature — until we have at
least 8-10 enterprise pages, sub-tabs add navigation cost without
discoverability benefit.

### Decision 2 — Authored vs. stub split (13 + 10 pages)

**Decision:** Of the ~24 IA pages, this change *fully authors* exactly
13 pages and *stubs* the remaining 10. Stubs are real pages with
frontmatter, title, sidebar entry, and a "TODO: see CLAUDE.md §X —
content authoring deferred to a follow-on change" pointer.

**Authored pages:**

| Page | Source content origin | Why authored now |
|---|---|---|
| `docs/introduction.md` | New content (replaces starter) | Sidebar landing — must work day one |
| `docs/architecture/upstream-boundary.md` | CLAUDE.md "Upstream Backend Boundary" + the upstream-boundary-check skill | Cited by skill, must have a target |
| `docs/conventions/quality-gates.md` | CLAUDE.md "Documentation Maintenance" + Serena memory `task_completion_checklist.md` | Cited by 3+ surfaces |
| `docs/conventions/regression-guards.md` | The 6 guards' provenance comments | Cited by 4 test files |
| `docs/conventions/no-scratchpad-references.md` | The new rule | The whole point of this change |
| `docs/conventions/tscheck-baseline.md` | `.scratchpad/tscheck-remediation-plan.md` (snapshot) | 3 incoming refs |
| `docs/enterprise/fork-posture.md` | CLAUDE.md "What is this?" + README.md "About this fork" | Duplicated across 4+ surfaces today |
| `docs/enterprise/upstream-features.md` | `.scratchpad/upstream-features-inventory.md` (snapshot) | 42 incoming refs |
| `docs/enterprise/auth-strategy.md` | `.scratchpad/auth-strategy-envoy-gateway.md` v2.1 (snapshot) | 31 incoming refs |
| `docs/enterprise/auth-fallback.md` | `.scratchpad/enterprise-auth-integration-strategy.md` v5 (snapshot) | 5 incoming refs |
| `docs/enterprise/envoy-smoke-test.md` | `.scratchpad/forwardaccesstoken-smoke-test.md` (snapshot) | 4 incoming refs |
| `docs/enterprise/phase-0-gates.md` | CLAUDE.md "Phase 0 progress" + the phase-0-progress skill | Cited by skill, key narrative |
| `docs/enterprise/cluster-facts.md` | CLAUDE.md "Cluster facts" + scattered Serena notes | Consolidates a known scattered topic |

**Stubbed pages (10):**
- `docs/architecture/overview.md`
- `docs/architecture/tech-stack.md`
- `docs/architecture/codebase-layout.md`
- `docs/architecture/database.md`
- `docs/architecture/trpc-routers.md`
- `docs/conventions/brand-taxonomy.md` (with link to brand-identity spec)
- `docs/conventions/pinned-deps.md`
- `docs/conventions/feature-flags.md`
- `docs/operations/release.md`
- `docs/operations/debugging-first-install.md`
- `docs/operations/env-gotchas.md`
- `docs/operations/cluster-access.md`

**Why this split:** The 13 authored pages have *concrete incoming
references* in the 91-line inventory. They are the load-bearing
content. The 10 stubs are pages whose content currently lives in
CLAUDE.md / Serena memories and is *not* cited from tracked files via
`.scratchpad/` paths — so they don't *need* to exist as part of this
change to fix the no-scratchpad rule. They exist as stubs only to
make the IA shape complete and discoverable.

**Why stub at all instead of waiting:** A sidebar with a "Conventions"
group containing only one item (`no-scratchpad-references.md`) looks
broken and signals to a reader that the docs are abandoned. Stubs make
the IA legible at a glance. Each stub is ~10 lines and takes ~2
minutes to write.

### Decision 3 — Snapshot-and-deprecate pattern (Q3 Option A from explore session)

**Decision:** For each of the five `.scratchpad/` originals being
promoted, this change does the following in one commit:

1. **COPY** the current content of the source file into the new
   `docs/` page, with xyd-compatible frontmatter prepended (`title`,
   `icon`).
2. **PREPEND a `> **DEPRECATED**` banner** to the `.scratchpad/`
   source pointing at the docs/ replacement. The banner reads:
   ```
   > **DEPRECATED — see [`docs/<path>`](../docs/<path>) for the
   > canonical version.** This file is preserved as the source for the
   > in-flight OpenSpec changes that still cite it (currently:
   > `add-feature-flag-infrastructure`, `retire-mock-api-translator`,
   > `remove-upstream-sandbox-oauth`). It will be deleted by a
   > follow-on cleanup change once those three close.
   ```
3. **DO NOT DELETE** the `.scratchpad/` source. The three in-flight
   OpenSpec changes still cite the original paths in their tasks/
   design/proposal, and the `Tier C` style allowlist on the new
   no-scratchpad-references guard explicitly exempts those archived
   change directories — but the *active* in-flight changes are not yet
   archived, so we cannot delete the files they cite without breaking
   their citations.

**Why Option A (snapshot-and-deprecate) and not Option B (hard cut):**

The hard-cut approach would delete the `.scratchpad/` originals immediately
and force the three in-flight changes to update their citations as part of
this change. The risk: those three changes are *active workstreams*. The
`remove-upstream-sandbox-oauth` change in particular went through a
4-reviewer audit and has 66 carefully-sequenced tasks. Forcing it to also
absorb a citation-update sweep mid-flight invites scope creep and merge
conflicts. Option A leaves the in-flight work untouched and pays the cost
of a follow-up cleanup change later, when those three close naturally.

**Why not Option C (symlinks):** Considered and rejected — symlinks would
not work because (a) `.scratchpad/` is gitignored, so the symlink target
would be a non-tracked file, and (b) xyd's content loader walks the
docs/ directory and reads files directly; it would not follow a symlink
out to gitignored content.

### Decision 4 — xyd-js version bump empirical validation

**Decision:** Pin `@xyd-js/cli` to exactly
`0.0.0-build-1202121-20260121231224` (no caret, no tilde, exact match).

**Why this version specifically:** It is the npm `latest` dist-tag for
`@xyd-js/cli` as of 2026-04-09, published 2026-01-21 (~3 months old at
the time of this change). All 28 sibling `@xyd-js/*` packages
(`@xyd-js/core`, `@xyd-js/host`, `@xyd-js/documan`, `@xyd-js/components`,
`@xyd-js/themes`, `@xyd-js/theme-picasso`, `@xyd-js/theme-cosmo`,
`@xyd-js/theme-gusto`, `@xyd-js/theme-opener`, `@xyd-js/theme-poetry`,
`@xyd-js/theme-solar`, `@xyd-js/atlas`, `@xyd-js/cli-sdk`,
`@xyd-js/composer`, `@xyd-js/content`, `@xyd-js/context`,
`@xyd-js/framework`, `@xyd-js/gql`, `@xyd-js/openapi`,
`@xyd-js/openapi-sampler`, `@xyd-js/plugin-algolia`, `@xyd-js/plugin-docs`,
`@xyd-js/plugin-orama`, `@xyd-js/plugins`, `@xyd-js/sources`,
`@xyd-js/ui`, `@xyd-js/uniform`, `@xyd-js/analytics`) publish in lockstep
at this exact same version string. Mixing channels (e.g., cli on the
build channel + core on the xyd channel) would mismatch and is unsafe.

**The version string is ugly** (`0.0.0-build-<sha>-<datetime>`) but that
is the project's release-naming convention. The pinned starter
`0.1.0-xyd.197` was on a *different* (now-dead) channel that last
published 2025-07-01 — it has not received updates in 9 months, matching
the user's intuition exactly.

**Empirical validation evidence (from the 2026-04-09 explore session):**

```
Sandbox install + build matrix:
─────────────────────────────────
1.  cp -r docs/* /tmp/xyd-bump-test-XXX/
2.  Edit package.json: 0.1.0-xyd.197 → 0.0.0-build-1202121-20260121231224
3.  bun install            → 928 packages, 9.26s, 1 benign peer warning
4.  bun run build          → exit 0, 1847 modules transformed, ~4 min
5.  ls .xyd/build/client   → 6.2 MB static site, valid output
6.  bun audit              → "No vulnerabilities found"

The benign peer warning:
  warn: incorrect peer dependency "@orama/core@0.1.11"
What's installed:
  @orama/core@0.1.11 (matches the warned version)
Conclusion: bun mis-attribution; warning is harmless. Document and ignore.

Schema compatibility:
  Upstream xyd-js/starter (last commit 2025-08-12) ships docs.json that
  is byte-identical to ours. The cli has published 170+ build versions
  since the starter was last refreshed. The fact that the schema has
  not changed across that release window is a strong empirical signal
  of forward compatibility.
```

This empirical validation is the basis for the pin. A future bump must
re-run the same matrix.

### Decision 5 — Lockfile tracking (Q7 from explore session)

**Decision:** Track `docs/bun.lock` in git.

**Why:** The exact pin on `@xyd-js/cli` doesn't constrain the resolved
versions of the 928 transitive dependencies. Without a tracked lockfile,
each contributor and each CI run resolves the tree independently,
potentially picking up different transitive versions over time. Tracked
lockfile + `bun install --frozen-lockfile` is the only way to guarantee
that the docs build is reproducible across machines and across time.

**Why not gitignore:** The "two lockfiles in one repo confuse
contributors" objection is solved with a one-line comment in
`docs/package.json` and a section in `docs/README.md`. The cost of
confusion is far smaller than the cost of un-reproducible CI.

### Decision 6 — Regression guard allowlist

**Decision:** The `tests/regression/no-scratchpad-references.test.ts`
guard scans all git-tracked files (`git ls-files`) for any line
matching `\.scratchpad/`. Matches in the following file paths or path
prefixes are allowlisted:

```
ALLOWLIST (file-level):
─────────────────────────
1. openspec/changes/archive/**             — immutable historical records;
                                              archived OpenSpec changes
                                              describe past state and may
                                              cite scratchpad files that
                                              existed at archive time
2. CLAUDE.md                                — the "Working Directories &
                                              Conventions" section
                                              legitimately *describes*
                                              .scratchpad/ as a concept
                                              without citing specific files
3. .claude/skills/docs-drift-check/SKILL.md — the docs-drift-check skill
                                              checks for drift IN
                                              .scratchpad/, so it must
                                              reference the directory
4. tests/regression/no-scratchpad-          — the guard itself contains
   references.test.ts                         the literal string
                                              ".scratchpad/" in its
                                              detection regex
```

**Why file-level not line-level:** Line-number allowlists drift every time
the surrounding file is edited. File-level allowlists are stable. Each
allowlist entry is paired with a comment explaining *why* the file is
exempt (which is enforced by code review, not the test).

**What the guard catches:** Any new line in any tracked file (outside the
4 allowlisted files) that contains the literal substring `.scratchpad/`.
This is intentionally a substring match, not a regex — `.scratchpad`
without the trailing slash would not match (and would likely be a prose
mention like "in the scratchpad directory" which is fine).

**What the guard does NOT catch:**
- References inside the 4 allowlisted files (intentional)
- Prose mentions of "scratchpad" without the literal `.scratchpad/`
  string (intentional — those are not pointers, they're descriptions)
- References inside `.gitignore` (intentional — `.gitignore` *contains*
  `.scratchpad/` as the rule that ignores it; the guard runs on
  `git ls-files` output and `.gitignore` IS tracked, so it would be
  scanned, but the line `.scratchpad/` in `.gitignore` is on its own
  line and the regex matches the substring including the leading dot;
  → `.gitignore` is added to the allowlist as a 5th entry)

```
FINAL ALLOWLIST (file-level, 5 entries):
─────────────────────────────────────────
1. openspec/changes/archive/**
2. CLAUDE.md
3. .claude/skills/docs-drift-check/SKILL.md
4. tests/regression/no-scratchpad-references.test.ts
5. .gitignore
```

### Decision 7 — Version pin in CLAUDE.md "Dependency Version Constraints"

**Decision:** Add `@xyd-js/cli` to the existing CLAUDE.md "Dependency
Version Constraints (LOAD-BEARING — DO NOT BUMP CASUALLY)" section
alongside Vite/Tailwind/Shiki/Electron/Claude/Codex pins. The new entry
reads:

```
- **`@xyd-js/cli` (in docs/package.json) pinned to exactly
  `0.0.0-build-1202121-20260121231224`** — the npm `latest` dist-tag for
  the xyd-js documentation generator, published 2026-01-21. Bumping
  requires the verify-pin skill workflow because xyd publishes
  pre-release builds in lockstep across 28 sibling packages, and any
  bump requires re-validating the docs.json schema and a sandbox
  install + build cycle.
```

The `verify-pin` skill at `.claude/skills/verify-pin/SKILL.md` already
covers Claude binary, Codex, Electron, Vite, Tailwind, and Shiki bumps.
This change adds an "xyd-js" section to that skill following the same
pattern.

### Decision 8 — CI integration

**Decision:** Add a 6th job called `docs-build` to
`.github/workflows/ci.yml`, following the same shape as the existing
`build` job. The job runs:

```yaml
docs-build:
  name: Docs build (xyd)
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - name: Install Bun
      uses: oven-sh/setup-bun@v2
      with:
        bun-version: latest
    - name: Install docs dependencies
      working-directory: docs
      run: bun install --frozen-lockfile
    - name: Build docs
      working-directory: docs
      run: bun run build
```

The existing `status` aggregator job's `needs:` list grows from 4 to 5
(adds `docs-build`) and its environment variables get one new entry
(`DOCS_BUILD_RESULT`). The aggregator's failure check expands to include
`DOCS_BUILD_RESULT != "success"`.

**Why a separate job, not inline in `build`:** Parallel execution. The
existing `build` job takes ~5 min for the Electron app build; `docs-build`
takes ~4 min. Running them in parallel keeps total CI time bounded by
the slowest job, not the sum.

**Why `--frozen-lockfile`:** Enforces the lockfile-tracked decision —
if `docs/bun.lock` is out of sync with `docs/package.json`, CI fails
loudly instead of silently re-resolving.

## Risks / Trade-offs

### Risk 1 — Mid-flight scratchpad content edits

**Likelihood:** HIGH (the three in-flight OpenSpec changes are active).
**Blast radius:** MEDIUM (could create stale snapshots in docs/).

**The risk:** While this change is in flight, one of the three in-flight
OpenSpec changes might edit `.scratchpad/auth-strategy-envoy-gateway.md`
or `.scratchpad/upstream-features-inventory.md`. If those edits land
*before* this change does, the snapshot in `docs/` will already be
stale by the time it lands.

**Mitigation:**
1. The snapshot is taken at *promotion time* (Phase 4 of tasks.md), not
   at proposal-creation time. So the snapshot reflects the latest
   `.scratchpad/` content as of when the implementation runs.
2. The DEPRECATED banner makes it explicit that the canonical version
   moved to docs/. Future edits should land in docs/, not in
   .scratchpad/.
3. The follow-on cleanup change that *deletes* the .scratchpad/ originals
   includes a final diff-and-merge step: any drift between the
   .scratchpad/ original and the docs/ snapshot at the moment of
   deletion gets reconciled.

### Risk 2 — xyd-js publishes a new build mid-flight

**Likelihood:** MEDIUM (xyd publishes weekly-to-monthly).
**Blast radius:** LOW (the pin is exact; the new publish does not affect
us until we explicitly bump).

**Mitigation:** The pin is exact (`0.0.0-build-1202121-20260121231224`,
no caret). A new publish does not cascade. The proposal documents the
empirical validation against this specific version. A future bump
becomes its own change following the verify-pin workflow.

### Risk 3 — xyd writing-framework directives create authoring lock-in

**Likelihood:** LOW (this change uses plain GFM markdown for all 13
authored pages, no `:::callout` or `@uniform()` macros).
**Blast radius:** LOW (if we adopt directives later, they're additive).

**Mitigation:** Restrict authored content to standard GFM (headings,
lists, tables, code blocks, links, blockquotes, emphasis). Defer
xyd-specific directive adoption to follow-on changes when the value is
clear.

### Risk 4 — The 91-reference relink phase is mechanical but tedious

**Likelihood:** N/A (this is a cost, not a risk).
**Blast radius:** Tasks.md gets long (~85 tasks total).

**Mitigation:** The relinks are grouped by source file in tasks.md so
each task touches at most one file. A script could automate ~80% of
the relinks, but this change does *not* generate or run a script —
each edit is reviewed individually because the citation context
sometimes needs human judgment ("does this reference belong to a
specific docs/ section anchor or just the page root?").

### Risk 5 — CI docs-build job adds ~4 min per PR

**Likelihood:** N/A (cost only).
**Blast radius:** LOW (parallel job; total CI time bounded by slowest
job).

**Mitigation:** None needed. The existing CI total is ~7 min wall-clock
because all jobs run in parallel; adding docs-build at ~4 min does not
change the wall-clock time.

### Risk 6 — Documentation duplication between CLAUDE.md and docs/

**Likelihood:** HIGH if not actively managed.
**Blast radius:** MEDIUM (drift between two surfaces over time).

**The risk:** After this change, CLAUDE.md still contains "Architecture",
"Phase 0 progress", "Documentation Maintenance" sections. The same
content also lives in `docs/architecture/*` (stubbed) and
`docs/enterprise/phase-0-gates.md` (authored). Over time these two
surfaces will drift.

**Mitigation:**
1. The `documentation-site` capability spec will require that CLAUDE.md
   sections covered by `docs/` pages become *thin pointers* — i.e.,
   "Phase 0 status: see docs/enterprise/phase-0-gates.md" rather than
   the full table.
2. The `docs-drift-check` skill (which already exists, with 11 drift
   points after the prior session) gains a 12th drift point: "CLAUDE.md
   section X duplicates docs/ page Y, check for drift".
3. **Phase 11 of tasks.md** explicitly thins out CLAUDE.md sections
   that are now covered by docs/ pages. The thinning is done as part
   of *this change*, not deferred — otherwise the duplication is real
   the moment this change lands.

## Migration Plan

This change has no application-code migration. There are no DB schemas,
no breaking API changes, no spawn-environment changes, no OAuth flow
changes. The migration plan is purely a sequencing recipe for the
~85 tasks in tasks.md:

```
PHASE   ASSERTION                                  Verification
═══════════════════════════════════════════════════════════════════════
1       docs/ is tracked                            git ls-files docs/
2       @xyd-js/cli pinned and lockfile tracked     git ls-files docs/bun.lock
3       docs.json IA matches the 5-tab spec         cd docs && bun run build
                                                    + manually inspect sidebar
4       5 promoted snapshots authored               wc -l docs/enterprise/*.md
5       8 native pages authored                     wc -l docs/conventions/*.md
                                                    + docs/architecture/*.md
6       10 stubs render                             cd docs && bun run build
7       CI has docs-build job                       grep docs-build .github/workflows/ci.yml
8       no-scratchpad-references guard exists       bun test tests/regression/no-scratchpad-references.test.ts
9       91 references relinked or removed           git ls-files | xargs grep -l '\.scratchpad/' | wc -l
                                                    → should equal allowlist size + 5 .scratchpad/ originals
                                                    (which are tracked in git? No — they're gitignored, so 0)
                                                    → final count should be 5 (the allowlist)
10      .scratchpad/xyd-starter-docs/ deleted       ! test -d .scratchpad/xyd-starter-docs
11      CLAUDE.md, README, CONTRIBUTING, AGENTS,    grep -c 'docs/' CLAUDE.md (increases)
        memories, PROJECT_INDEX, openspec/config,   grep -c '\.scratchpad/' CLAUDE.md (decreases)
        settings.json, skills, agents updated
12      4 quality gates pass                        bun run ts:check && bun run build && bun test && bun audit
                                                    + cd docs && bun run build
13      In-flight openspec changes notified         grep -l 'docs/' openspec/changes/{add-feature-flag-...,retire-mock-api-...,remove-upstream-...}
14      bunx openspec validate --strict             bunx @fission-ai/openspec@1.2.0 validate bootstrap-documentation-site --strict
                                                    → exit 0
```

The migration is **strictly sequential** for Phases 1-3 (you cannot
build the IA before tracking docs/, you cannot author pages before the
IA is wired up). Phases 4 and 5 can run in parallel. Phase 6 follows.
Phases 7-9 are independent and can run in any order. Phase 10 is
isolated. Phase 11 must happen after Phase 4 (so it knows the actual
docs/ paths to point at). Phases 12-14 are the final verification
sequence and must run last in the listed order.

**Rollback procedure:** This change has no runtime side effects. To
roll back, revert the entire commit. The .scratchpad/ originals
remain in place (only the DEPRECATED banner is removed by the revert).
No data loss, no schema rollback, no manual cleanup required.

## Open Questions

The explore session resolved Q1-Q7 (the IA shape, capability slug,
snapshot pattern, skills/agents target, CI integration, banner replace,
lockfile tracking). The following questions are intentionally deferred
to follow-on work:

1. **When do the .scratchpad/ originals get deleted?** Answer: when the
   three in-flight OpenSpec changes (`add-feature-flag-infrastructure`,
   `retire-mock-api-translator`, `remove-upstream-sandbox-oauth`) all
   reach archive state. A separate cleanup change at that time deletes
   the 5 .scratchpad/ originals + their DEPRECATED banners. Estimated
   timing: after Phase 0 fully closes.

2. **Where does the published docs site get hosted?** Answer: deferred.
   `xyd build` produces a 6.2 MB static site at `docs/.xyd/build/client/`.
   Hosting it at e.g. `apollosai.dev/docs` requires a Cloudflare/Pages/
   netlify/MinIO setup that doesn't belong in a documentation bootstrap
   change. Until hosted, contributors run the docs locally via
   `cd docs && bun install && bunx xyd` (the dev server) at
   `http://localhost:5175`.

3. **Should the xyd writing-framework directives (`:::callout`,
   `@uniform()`, etc.) be adopted?** Answer: deferred. The 13 pages
   authored in this change use plain GFM. Adopting xyd-specific
   directives is a follow-on stylistic decision once we have lived with
   the site for a while.

4. **Should the API Reference tab be removed if 1Code never exposes a
   public REST API?** Answer: keep it. Cost is zero (the starter ships
   with the OpenAPI mount slot). Future-proofing for a possible REST
   surface is cheap insurance.

5. **Should `.full-review/` get the same treatment?** Answer: deferred.
   `.full-review/` references in tracked files are rare and the user
   has historically tolerated them as evidence anchors. If they become
   load-bearing, a follow-on change can address them with the same
   pattern.

6. **Should the docs site get its own version number / changelog?**
   Answer: deferred. Today docs/ shares the repo's version. A docs-only
   versioning scheme is follow-on work.
