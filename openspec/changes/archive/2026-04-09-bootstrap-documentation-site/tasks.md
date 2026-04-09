## 1. Stage docs/ for tracking

- [x] 1.1 Verify the current state of `docs/` matches the upstream
  `xyd-js/starter` template — run `git ls-files docs/` (expect zero
  output, the directory is staged but untracked) and inspect
  `docs/docs.json`, `docs/package.json` for byte-equality with the
  upstream starter.
- [x] 1.2 Verify `docs/.gitignore` contains `.xyd` (the build output
  directory) so the eventual `docs/.xyd/build/` artifact dir does not
  get committed.
- [x] 1.3 Verify the root `.gitignore` line 2 (`node_modules/`)
  correctly captures `docs/node_modules/` via gitignore's "match at any
  depth" semantics. Document the verification in design.md if it does
  not, and add an explicit `docs/node_modules/` line to the root
  `.gitignore` if needed.
- [x] 1.4 Delete `.scratchpad/xyd-starter-docs/` — it is a duplicate
  of `docs/` from the user's earlier exploration step. Verify the
  contents are byte-identical to `docs/` before deleting (`diff -r
  .scratchpad/xyd-starter-docs/ docs/`).
- [x] 1.5 Do NOT `git add docs/` yet — Phase 2 modifies
  `docs/package.json` and produces `docs/bun.lock`, and we want a
  single clean `git add` after both phases finish.

## 2. xyd-js dependency upgrade and lockfile bootstrap

- [x] 2.1 Edit `docs/package.json`:
  - Change `"name": "starter"` to `"name": "1code-docs"`
  - Add `"private": true` (prevents accidental npm publish)
  - Add `"description": "1Code enterprise fork — canonical
    documentation site"`
  - Change `"@xyd-js/cli": "0.1.0-xyd.197"` to
    `"@xyd-js/cli": "0.0.0-build-1202121-20260121231224"`
  - Keep `"engines": { "node": "22" }` unchanged
  - Add a top-level comment field (or a sibling `"//"` field) noting
    "xyd-js cli pinned exactly per documentation-site capability spec —
    see CLAUDE.md 'Dependency Version Constraints'"
- [x] 2.2 Run `cd docs && bun install` (NOT `--frozen-lockfile` for
  this initial install — the lockfile does not yet exist). Capture
  output: expect ~928 packages installed in ~10 seconds, with a single
  benign peer-dependency warning about `@orama/core@0.1.11`.
- [x] 2.3 Verify the produced lockfile lands at `docs/bun.lock` (or
  `docs/bun.lockb`, whichever bun produces). Note the filename in
  tasks.md and proceed.
- [x] 2.4 Run `cd docs && bun run build`. Expect: exit 0, ~1847 modules
  transformed, ~6.2 MB output to `docs/.xyd/build/client/`, build time
  ~4 minutes on M-series Mac. Capture exit code and a snippet of the
  final build output for the design.md "Empirical validation" section
  if not already there.
- [x] 2.5 Verify `docs/.xyd/` is gitignored by re-running
  `git status docs/` — the `.xyd/` directory and `node_modules/` should
  NOT appear in the untracked list. If they do, fix the gitignore rules
  before proceeding.
- [x] 2.6 Run `cd docs && bun audit`. Expect: "No vulnerabilities
  found". If new advisories appear (the ecosystem could shift between
  the explore session and the implementation session), document them
  in `docs/conventions/pinned-deps.md` (a stub page in this change) and
  flag in the PR description.

## 3. Rewrite docs.json IA and replace starter assets

- [x] 3.1 Rewrite `docs/docs.json`:
  - Replace the starter banner (`"**xyd 0.1.0** - Docs platform for
    future dev."`) with `"1Code — enterprise fork documentation"` and
    set `"label": "v0"` and `"icon": "book-open"`
  - Update `theme.logo.light` and `theme.logo.dark` to point at
    `/public/assets/1code-logo-light.svg` and `1code-logo-dark.svg`
    respectively (assets created in task 3.4)
  - Replace `theme.favicon` to point at `/public/assets/1code-icon.svg`
  - Restructure `navigation.tabs` to the 5-tab IA: `Architecture`,
    `Enterprise`, `Conventions`, `Operations`, `API Reference`. Each
    tab gets a `title`, an `icon` (`code`, `building`, `book-text`,
    `wrench`, `terminal-square`), and either an `href` (for the
    landing page of the tab) or a `page` reference.
  - Restructure `navigation.sidebar` to mirror the IA tree from
    design.md Decision 2. Each group gets a `group` title, an `icon`,
    and a `pages` array of slugs.
  - Keep the `api.openapi` mount at `api-reference` (the existing
    starter slot) for future use. Even though 1Code does not expose a
    public REST API today, the slot is cheap to retain.
  - Keep the `redirects` block but change `index → introduction` to
    `index → introduction` (no change — already correct).
- [x] 3.2 Delete the 6 starter placeholder pages that document xyd
  itself (not 1Code):
  - `docs/pages-and-routing.md`
  - `docs/markdown.md`
  - `docs/developer-content.md`
  - `docs/icons.md`
  - `docs/make-docs-yours.md`
  - (keep `docs/introduction.md` — it gets *replaced* in task 4.1, not
    deleted, so the file path remains stable in `docs.json`)
- [x] 3.3 Replace `docs/README.md` with a brief "this is the 1Code
  documentation site" pointer:
  - One sentence on what the site is
  - One sentence on how to run it locally
    (`cd docs && bun install --frozen-lockfile && bunx xyd` for dev,
    `bun run build` for static output)
  - One sentence pointing at `docs/conventions/no-scratchpad-
    references.md` for the contribution rule
  - Total length: ~10 lines.
- [x] 3.4 Source 1Code branding assets for `docs/public/assets/`:
  - `1code-logo-light.svg` — light-mode logo
  - `1code-logo-dark.svg` — dark-mode logo
  - `1code-icon.svg` — favicon (square, simple)
  - Source from existing repo assets (`build/icon.png`,
    `build/icon.icns`, or the 1Code logo used in the renderer at
    `src/renderer/components/ui/logo.tsx`). If the existing assets are
    PNG-only, convert to SVG via Inkscape or accept PNG fallback in
    `docs/docs.json` (xyd's `theme.logo` accepts PNG).
- [x] 3.5 Run `cd docs && bun run build` again to confirm the IA
  rewrite + asset replacement still produces a valid build. Expect
  exit 0.

## 4. Author 5 promoted snapshot pages

For each page below: COPY the current content of the source
`.scratchpad/` file, prepend xyd frontmatter (`title`, `icon`,
optional `subtitle`), inline-fix any internal cross-references that
pointed at OTHER `.scratchpad/` files (relink to the new docs/
locations, since this change is establishing all five at once), and
save to the docs/ destination.

- [x] 4.1 `docs/enterprise/upstream-features.md`:
  - Source: `.scratchpad/upstream-features-inventory.md` v2
  - Frontmatter: `title: Upstream Features Catalog (F1-F10)`,
    `icon: list-tree`
  - Inline relinks: `auth-strategy-envoy-gateway.md` → 
    `./auth-strategy.md`; `enterprise-auth-integration-strategy.md` →
    `./auth-fallback.md`; `forwardaccesstoken-smoke-test.md` →
    `./envoy-smoke-test.md`
  - Add a one-paragraph header noting this is the canonical home,
    with a link back to the deprecated `.scratchpad/` original for
    historical context (the original retains a DEPRECATED banner per
    task 4.6)
- [x] 4.2 `docs/enterprise/auth-strategy.md`:
  - Source: `.scratchpad/auth-strategy-envoy-gateway.md` v2.1
  - Frontmatter: `title: Enterprise Auth Strategy (Envoy Gateway)`,
    `icon: shield-check`
  - Inline relinks: `upstream-features-inventory.md` →
    `./upstream-features.md`; `enterprise-auth-integration-strategy.md`
    → `./auth-fallback.md`; `forwardaccesstoken-smoke-test.md` →
    `./envoy-smoke-test.md`
  - This is the longest promoted page (~111 KB source). Be careful
    with section anchors — many incoming references cite specific
    sections (`§3.1`, `§4.9`, `§5.4`, `§6`). Preserve all heading
    levels exactly so deep links continue to work.
- [x] 4.3 `docs/enterprise/auth-fallback.md`:
  - Source: `.scratchpad/enterprise-auth-integration-strategy.md` v5
  - Frontmatter: `title: Enterprise Auth Fallback (MSAL-in-Electron)`,
    `icon: shield-question`
  - Inline relinks: `auth-strategy-envoy-gateway.md` →
    `./auth-strategy.md`; `upstream-features-inventory.md` →
    `./upstream-features.md`
  - Add a header note: "This is the FALLBACK strategy. The CHOSEN
    strategy is `auth-strategy.md`."
- [x] 4.4 `docs/enterprise/envoy-smoke-test.md`:
  - Source: `.scratchpad/forwardaccesstoken-smoke-test.md`
  - Frontmatter: `title: Envoy Gateway Dual-Auth Smoke Test`,
    `icon: flask-conical`
  - Inline relinks: `auth-strategy-envoy-gateway.md` →
    `./auth-strategy.md`
  - Add a header note: "Empirically validated 2026-04-08 against the
    Talos AI cluster — see Outcome A in the runbook below."
- [x] 4.5 `docs/conventions/tscheck-baseline.md`:
  - Source: `.scratchpad/tscheck-remediation-plan.md`
  - Frontmatter: `title: TypeScript Baseline & Remediation`,
    `icon: file-check`
  - Inline relinks: `tscheck-snapshot-2026-04-08.log` → keep as
    `.scratchpad/tscheck-snapshot-2026-04-08.log` if the log file is
    still in `.scratchpad/` (it is, per the prior session — the log is
    an appendix to this plan and was kept in place); add an inline
    note "the snapshot log remains in `.scratchpad/` because it is
    pure raw output, not authored content" — this is the ONE
    intentional exception to the no-scratchpad-references rule for
    THIS authored page, and it is allowlisted because the page lives
    inside `docs/` which is exempt by being inside the docs/ tree
    (the regression guard scope excludes `docs/` — see Decision 6 in
    design.md)
- [x] 4.6 PREPEND a DEPRECATED banner to each of the 5 source
  `.scratchpad/` files. The banner reads exactly:
  ```
  > **DEPRECATED — see [`docs/<path>`](../docs/<path>) for the canonical
  > version.** This file is preserved as the source for the in-flight
  > OpenSpec changes that still cite it (currently: `add-feature-flag-
  > infrastructure`, `retire-mock-api-translator`, `remove-upstream-
  > sandbox-oauth`). It will be deleted by a follow-on cleanup change
  > once those three close.
  ```
  Replace `<path>` with the destination docs/ path. Insert the banner
  AFTER any existing top-level `# Title` heading and BEFORE the body.
- [x] 4.7 Verify all 5 promoted pages render correctly via
  `cd docs && bun run build`. Expect exit 0 and no broken-link
  warnings in the build output.

## 5. Author 8 native pages

- [x] 5.1 `docs/introduction.md` (replaces the starter quickstart):
  - Frontmatter: `title: Introduction`, `icon: rocket`
  - Content: 1-paragraph overview of the 1Code enterprise fork, link
    to `docs/enterprise/fork-posture.md` for the full posture
    explanation, link to `docs/architecture/overview.md` (stub) for
    the high-level architecture, link to
    `docs/conventions/quality-gates.md` for the contributor rules.
- [x] 5.2 `docs/architecture/upstream-boundary.md`:
  - Frontmatter: `title: Upstream Backend Boundary`,
    `icon: arrow-left-right`
  - Source content: CLAUDE.md "Upstream Backend Boundary" section +
    the `.claude/skills/upstream-boundary-check/SKILL.md` rules
  - This is the page the upstream-boundary-check skill will cite
    after Phase 12. Keep the rule list explicit and copy-able.
- [x] 5.3 `docs/conventions/quality-gates.md`:
  - Frontmatter: `title: Four Quality Gates`, `icon: shield-check`
  - Content: the `bun run ts:check`, `bun run build`, `bun test`,
    `bun audit` contract. Each gate gets: what it does, what it
    catches, current baseline (88 ts errors, 14 → 16 tests, 6 → 7
    regression guards, ~57 audit advisories), and the "none is a
    superset of the others" warning.
- [x] 5.4 `docs/conventions/regression-guards.md`:
  - Frontmatter: `title: Regression Guards`, `icon: shield`
  - Content: the 7 guards (the 6 existing + the new
    `no-scratchpad-references` from this change) — each guard gets:
    file path, what it protects, what change motivated it, and a one-
    line "how to add a new guard" pointer to the
    `.claude/skills/new-regression-guard/` skill.
- [x] 5.5 `docs/conventions/no-scratchpad-references.md`:
  - Frontmatter: `title: No .scratchpad/ References from Tracked
    Files`, `icon: alert-triangle`
  - Content: the rule, the rationale, the allowlist, and the link to
    the capability spec at `openspec/specs/documentation-site/spec.md`
    (post-archive). This is the readable contributor guidance; the
    spec is the normative source.
- [x] 5.6 `docs/enterprise/fork-posture.md`:
  - Frontmatter: `title: Fork Posture`, `icon: git-branch`
  - Content: consolidates the "What is this?" / "About this fork"
    paragraphs currently duplicated across CLAUDE.md, README.md,
    CONTRIBUTING.md, AGENTS.md. Becomes the single source. Includes
    the self-host-everything theme statement.
- [x] 5.7 `docs/enterprise/phase-0-gates.md`:
  - Frontmatter: `title: Phase 0 Hard Gates`, `icon: list-checks`
  - Content: the 15-gate Phase 0 checklist currently in CLAUDE.md
    "Phase 0 progress" + the `phase-0-progress` skill validation
    logic. Cross-references the in-flight `remove-upstream-sandbox-
    oauth` change for gate #8.
- [x] 5.8 `docs/enterprise/cluster-facts.md`:
  - Frontmatter: `title: Talos AI Cluster Facts`, `icon: server`
  - Content: consolidates the cluster details currently scattered
    across CLAUDE.md "Cluster facts (discovered 2026-04-08)" and the
    Serena memories: Envoy Gateway v1.7.1, Entra tenant
    `f505346f-75cf-458b-baeb-10708d41967d`, echo server at
    `https://echo.aarons.com/`, the existing `kube-system/hubble-ui-
    oidc` reference SecurityPolicy, the Flux/GitOps workflow rule
    ("never use direct kubectl apply").

## 6. Author 10 stub pages

Each stub is a real page with frontmatter, a `# Title`, a one-line
"this page is a stub" notice, a `## TODO` section listing the topics
the future authored content should cover, and a "see also" link to
the corresponding CLAUDE.md or Serena memory section.

- [x] 6.1 `docs/architecture/overview.md` — stub pointing at CLAUDE.md
  "Architecture" tree.
- [x] 6.2 `docs/architecture/tech-stack.md` — stub pointing at CLAUDE.md
  "Tech Stack" table and `.serena/memories/project_overview.md`.
- [x] 6.3 `docs/architecture/codebase-layout.md` — stub pointing at the
  `src/` tree section in CLAUDE.md.
- [x] 6.4 `docs/architecture/database.md` — stub pointing at CLAUDE.md
  "Database (Drizzle ORM)" section and `src/main/lib/db/schema/index.ts`
  as the source of truth.
- [x] 6.5 `docs/architecture/trpc-routers.md` — stub pointing at
  CLAUDE.md "Architecture" router list and the
  `trpc-router-auditor` agent.
- [x] 6.6 `docs/conventions/brand-taxonomy.md` — stub linking to
  `openspec/specs/brand-identity/spec.md` as the authoritative source.
  This stub is intentionally short — the brand-identity capability
  spec is already the durable home; this page just provides
  discoverability from the docs sidebar.
- [x] 6.7 `docs/conventions/pinned-deps.md` — stub listing the
  load-bearing pins (Vite 6.x, Tailwind 3.x, Shiki 3.x, Electron 39
  EOL 2026-05-05, Claude CLI 2.1.96, Codex CLI 0.118.0,
  `@azure/msal-node` 3.8.x, `@xyd-js/cli`
  `0.0.0-build-1202121-20260121231224`) with one-line rationales.
- [x] 6.8 `docs/conventions/feature-flags.md` — stub pointing at the
  `feature_flag_overrides` table, `src/main/lib/feature-flags.ts`,
  and the `add-feature-flag-infrastructure` OpenSpec change.
- [x] 6.9 `docs/operations/release.md` — stub pointing at CLAUDE.md
  "Releasing a New Version" section and `scripts/upload-release.mjs`.
- [x] 6.10 `docs/operations/debugging-first-install.md` — stub pointing
  at CLAUDE.md "Debugging First Install Issues" section.
- [x] 6.11 `docs/operations/env-gotchas.md` — stub pointing at CLAUDE.md
  "Environment Notes" section.
- [x] 6.12 `docs/operations/cluster-access.md` — stub pointing at
  CLAUDE.md "Cluster access" section.
- [x] 6.13 Run `cd docs && bun run build` after all stubs are in
  place. Expect exit 0 with all 23 sidebar entries rendered.

## 7. Extend CI with docs-build job

- [x] 7.1 Edit `.github/workflows/ci.yml` header comment block (lines
  1-20):
  - Replace the line referencing `.scratchpad/auth-strategy-envoy-
    gateway.md §6` with a reference to
    `docs/enterprise/phase-0-gates.md`
  - Add a sentence noting "and the docs-build job runs `xyd build`
    against `docs/`" to the four-gate description (now five-gate)
- [x] 7.2 Add the `docs-build` job to the `jobs:` block, following the
  shape of the existing `build` job:
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
      - name: Build docs site
        working-directory: docs
        run: bun run build
  ```
- [x] 7.3 Update the `status` aggregator job:
  - Add `docs-build` to the `needs:` list (now 5 entries)
  - Add `DOCS_BUILD_RESULT: ${{ needs.docs-build.result }}` to `env:`
  - Update the bash failure check to include
    `[ "$DOCS_BUILD_RESULT" != "success" ]`
- [x] 7.4 Run `bun audit` and `bun test` locally to confirm nothing
  in the workflow file change breaks the existing test suite. (The
  workflow file is YAML, not TypeScript, so no ts:check impact.)

## 8. Add no-scratchpad-references regression guard

- [x] 8.1 Use the `.claude/skills/new-regression-guard/SKILL.md` skill
  to scaffold `tests/regression/no-scratchpad-references.test.ts`. The
  scaffold pattern provides the directory walker, `git ls-files`
  invocation, and the file-level allowlist Set.
- [x] 8.2 Implement the guard logic:
  - Run `git ls-files` from the repo root
  - For each tracked file, read its content
  - Search for the literal substring `.scratchpad/`
  - Skip files in the allowlist Set
  - Skip files inside `docs/` (the docs/ tree is the canonical home,
    and the promoted pages legitimately MAY mention `.scratchpad/`
    paths in their DEPRECATED banner cross-references — but actually
    they don't, so this is defensive)
  - Skip the `openspec/changes/archive/**` prefix
  - Fail the test with a structured error listing every offending
    file:line and a one-line actionable next-step
- [x] 8.3 Define the file-level allowlist Set with comments per the
  spec (Decision 6 in design.md):
  ```typescript
  const ALLOWLIST = new Set([
    ".gitignore",                                      // contains the gitignore rule itself
    "CLAUDE.md",                                       // describes .scratchpad/ as a concept
    ".claude/skills/docs-drift-check/SKILL.md",       // audits .scratchpad/ content
    "tests/regression/no-scratchpad-references.test.ts", // contains the detection regex
  ]);
  ```
- [x] 8.4 Add the prefix-allowlist check for
  `openspec/changes/archive/`:
  ```typescript
  if (file.startsWith("openspec/changes/archive/")) continue;
  ```
- [x] 8.5 Write the structured error message format. The error must
  include: count of violations, a `file:line` list with truncated
  snippet (~80 chars), an actionable next step (relink to docs/ or
  remove), and a reference to `openspec/specs/documentation-site/
  spec.md` for the rule.
- [x] 8.6 Run the guard in TDD-red state: `bun test
  tests/regression/no-scratchpad-references.test.ts`. Expect FAILURE
  because Phases 9-12 have not yet relinked the 91 references. The
  failure output should list approximately 86 violations (91 minus
  the 5 already-allowlisted files).
- [x] 8.7 Increment the test count narrative everywhere it appears:
  - CLAUDE.md `tests/regression/` description: "6 → 7 guards", "14 →
    ~16 tests"
  - `.serena/memories/codebase_structure.md`
  - `.serena/memories/style_and_conventions.md`
  - `.serena/memories/suggested_commands.md`
  - `.serena/memories/task_completion_checklist.md`
  - `.serena/memories/environment_and_gotchas.md`
  - `docs/conventions/regression-guards.md` (the page authored in
    task 5.4)

## 9. Relink the 91 cross-document references

This phase is grouped by source file because many files contain
multiple references and editing them once is cheaper than editing them
nine times. Each task lists the file, the references it contains, and
the relink target(s).

- [x] 9.1 `CLAUDE.md` — 9 references total. Relink each by section:
  - Lines ~10, ~26, ~245 (`upstream-features-inventory.md`) → 
    `docs/enterprise/upstream-features.md`
  - Line ~14 (`auth-strategy-envoy-gateway.md`) → 
    `docs/enterprise/auth-strategy.md`
  - Line ~14 (`enterprise-auth-integration-strategy.md`) →
    `docs/enterprise/auth-fallback.md`
  - Line ~249 (working-directories description) → leave as-is, this
    is the allowlisted "describes .scratchpad/ as a concept" section
  - Line ~260 (HARD RULE for auth code, references §4.9 and §5.4) →
    `docs/enterprise/auth-strategy.md#env-var-injection` and
    `docs/enterprise/auth-strategy.md#token-file-pattern` (preserve
    section anchors)
  - Line ~267 (`forwardaccesstoken-smoke-test.md`) →
    `docs/enterprise/envoy-smoke-test.md`
  - Line ~399 (Documentation Maintenance section) → update working
    directories list
  - Line ~401 (Phase 0 gate text rule) → 
    `docs/enterprise/phase-0-gates.md`
- [x] 9.2 `README.md` — 2 references:
  - Line 5 ("About this fork" paragraph) → relink both
    `upstream-features-inventory.md` and `auth-strategy-envoy-
    gateway.md` to their docs/ equivalents
  - Line 46 ("See [restoration priorities]") → 
    `docs/enterprise/upstream-features.md`
- [x] 9.3 `CONTRIBUTING.md` — 1 reference (line 73, "Self-host-
  everything theme") → relink both inline citations.
- [x] 9.4 `AGENTS.md` — 1 reference (line 28, raw-fetch upstream sites)
  → `docs/enterprise/upstream-features.md`
- [x] 9.5 `.claude/PROJECT_INDEX.md` — 4 references:
  - Line 6 (fork posture) → `docs/enterprise/fork-posture.md`
  - Line 22 (auth strategy reference table) → 
    `docs/enterprise/auth-strategy.md`
  - Line 23 (upstream dependency catalog) → 
    `docs/enterprise/upstream-features.md`
  - Line 268 (working directories description) → REWRITE the
    `.scratchpad/` description to remove specific file references but
    keep the directory description (Tier C: this is allowed because
    PROJECT_INDEX.md is not on the allowlist; relink to docs/
    instead).
- [x] 9.6 `.claude/settings.json` — 1 reference (PreToolUse hook auth
  edit warning, line ~13). Replace the inline `.scratchpad/auth-
  strategy-envoy-gateway.md §4.9 ... §5.4` reference with
  `docs/enterprise/auth-strategy.md` and the corresponding section
  anchors.
- [x] 9.7 `openspec/config.yaml` — 3 references:
  - Line 15 (`context:` body, "All SaaS features catalogued in...")
    → `docs/enterprise/upstream-features.md`
  - Line 57 (key reference documents list) → relink the inventory
    entry
  - Add new entry for `docs/enterprise/auth-strategy.md` and remove
    the corresponding `.scratchpad/` entry
- [x] 9.8 `.claude/agents/upstream-dependency-auditor.md` — 6
  references (description + body + footer). The agent investigates
  F-entries from the upstream features catalog. Relink ALL references
  to `docs/enterprise/upstream-features.md` and adjust the agent's
  workflow paragraph to read from the docs/ page instead of the
  scratchpad.
- [x] 9.9 `.claude/skills/upstream-boundary-check/SKILL.md` — 6
  references. This skill checks call sites against the catalog.
  Relink all references to `docs/enterprise/upstream-features.md`
  and `docs/enterprise/auth-strategy.md` as appropriate.
- [x] 9.10 `.claude/skills/openspec-propose-gate/SKILL.md` — 4
  references to `auth-strategy-envoy-gateway.md`. Relink all to
  `docs/enterprise/auth-strategy.md` (specifically the §6 anchor).
  Also update the skill's `sed -n` example commands to read from
  `docs/enterprise/auth-strategy.md` instead of the scratchpad.
- [x] 9.11 `.claude/skills/verify-strategy-compliance/SKILL.md` — 5
  references. Relink each (`auth-strategy-envoy-gateway.md` →
  `docs/enterprise/auth-strategy.md`,
  `forwardaccesstoken-smoke-test.md` → 
  `docs/enterprise/envoy-smoke-test.md`).
- [x] 9.12 `.claude/skills/phase-0-progress/SKILL.md` — 3 references.
  Relink to `docs/enterprise/auth-strategy.md` and
  `docs/enterprise/upstream-features.md`. Update the skill's
  filesystem-evidence shell commands to grep against the docs/ paths
  where appropriate (note: the F-count grep `grep -cE "^F[0-9]+ "
  .scratchpad/upstream-features-inventory.md` becomes `grep -cE "^F[0-9]+ "
  docs/enterprise/upstream-features.md`).
- [x] 9.13 `.claude/skills/docs-drift-check/SKILL.md` — 1 reference
  on line 86. This is the special-cased skill that legitimately
  audits scratchpad content; the line is on the allowlist. Leave
  it. Verify it's still on the test's allowlist after Phase 8.
- [x] 9.14 `.claude/skills/new-regression-guard/SKILL.md` — 1
  reference on line 52 (advice to link to a `.scratchpad/` strategy
  doc in regression guard top-of-file docstrings). Remove this
  guidance entirely; it now contradicts the no-scratchpad-references
  rule.
- [x] 9.15 `.serena/memories/codebase_structure.md` — 5 references.
  Relink each. Note: the rebrand-residual-audit reference on line 157
  was already cleaned in the prior session.
- [x] 9.16 `.serena/memories/project_overview.md` — 3 references.
  Relink each.
- [x] 9.17 `.serena/memories/style_and_conventions.md` — 1 reference.
  Relink.
- [x] 9.18 `.serena/memories/suggested_commands.md` — 1 reference.
  Relink.
- [x] 9.19 `.serena/memories/task_completion_checklist.md` — 2
  references. Relink each.
- [x] 9.20 `.serena/memories/environment_and_gotchas.md` — 1
  reference. Relink.
- [x] 9.21 `.github/dependabot.yml` — 1 reference in header comment
  (line 4). Replace `.scratchpad/auth-strategy-envoy-gateway.md v2.1
  §6` with `docs/enterprise/auth-strategy.md` and
  `docs/enterprise/phase-0-gates.md`.
- [x] 9.22 `tests/regression/auth-get-token-deleted.test.ts` — 1
  reference. Relink to `docs/enterprise/auth-strategy.md` (this is
  the provenance comment at the top of the test).
- [x] 9.23 `tests/regression/token-leak-logs-removed.test.ts` — 1
  reference. Relink to `docs/enterprise/auth-strategy.md`.
- [x] 9.24 `tests/regression/gpg-verification-present.test.ts` — 1
  reference. Relink.
- [x] 9.25 `tests/regression/credential-manager-deleted.test.ts` — 3
  references. Relink to `docs/conventions/tscheck-baseline.md`
  (specifically the §2 R1 anchor for the credential-manager root
  cause).
- [x] 9.26 `tests/regression/brand-sweep-complete.test.ts` — 1
  reference. Already cleaned in the prior session — verify it's gone
  and skip.
- [x] 9.27 `src/renderer/lib/remote-types.ts` — 1 reference in the
  file's doc comment (line 4). Relink to
  `docs/enterprise/upstream-features.md`.
- [x] 9.28 `src/renderer/lib/remote-app-router.ts` — 1 reference
  remaining (line 4 — note the typed-approuter reference on line 23
  was already removed in the prior session). Relink to
  `docs/enterprise/upstream-features.md`.
- [x] 9.29 `src/main/lib/feature-flags.ts` — 1 reference. Relink to
  `docs/enterprise/auth-strategy.md` (the strategy doc covers feature
  flag usage in the auth migration).
- [x] 9.30 `openspec/changes/add-feature-flag-infrastructure/
  proposal.md` — 1 reference. Relink to
  `docs/enterprise/auth-strategy.md`.
- [x] 9.31 `openspec/changes/add-feature-flag-infrastructure/tasks.md`
  — 1 reference (task 6.2 mentions `.scratchpad/upstream-features-
  inventory.md`). Relink to `docs/enterprise/upstream-features.md`
  AND remove the parenthetical "the inventory is gitignored so this
  is session-local only" note since the new docs/ home is tracked.
- [x] 9.32 `openspec/changes/retire-mock-api-translator/proposal.md`
  — 2 references. Relink each.
- [x] 9.33 `openspec/changes/retire-mock-api-translator/tasks.md` — 5
  references including the F2 fossil-by-design note. Relink each.
- [x] 9.34 `openspec/changes/retire-mock-api-translator/specs/
  renderer-data-access/spec.md` — 2 references. Relink each.
- [x] 9.35 `openspec/specs/brand-identity/spec.md` — 1 reference (line
  9, in the Tier C historical-references list mentioning
  `.scratchpad/`). Leave as-is — this is a description of which
  surfaces legitimately contain historical brand mentions, not a
  citation.
  - **DECISION:** This file is NOT on the allowlist, but the
    reference is generic ("historical references inside documentation
    under `.scratchpad/`") not a specific file pointer. Edit the line
    to remove `.scratchpad/` from the list since the rule is now
    "tracked files don't reference scratchpad" — Tier C historical
    references should now point at `docs/` or be removed.
- [x] 9.36 Verify the relink count:
  ```bash
  git ls-files | xargs grep -l '\.scratchpad/' 2>/dev/null | sort | uniq
  ```
  Expected output: only the 5 allowlist files (`.gitignore`,
  `CLAUDE.md`, `.claude/skills/docs-drift-check/SKILL.md`,
  `tests/regression/no-scratchpad-references.test.ts`, plus any
  `openspec/changes/archive/**` files which are also allowlisted).

## 10. Delete the .scratchpad/xyd-starter-docs duplicate

- [x] 10.1 Verify `diff -r .scratchpad/xyd-starter-docs/ docs/` shows
  only the expected differences (the docs.json IA rewrite, the
  package.json bump, the deleted starter pages, the new authored
  pages, the lockfile, etc.). The starter scaffold portion should
  match.
- [x] 10.2 `rm -rf .scratchpad/xyd-starter-docs/`

## 11. Thin out CLAUDE.md and other tracked surfaces

For each tracked surface where content has been promoted to a docs/
page, REPLACE the full content with a brief pointer. This is what
keeps CLAUDE.md from drifting against docs/ — the content has only
one canonical home post-change.

- [x] 11.1 CLAUDE.md "Phase 0 progress" section (lines ~16-26):
  Replace the 15-bullet checklist with a one-paragraph summary plus a
  link to `docs/enterprise/phase-0-gates.md`. Keep gate #8 explicitly
  called out (it's the active blocker) but link the other 14 to docs/.
- [x] 11.2 CLAUDE.md "Architecture" tree section (lines ~50-130):
  Keep the high-level prose but link the detailed router/feature
  lists to `docs/architecture/codebase-layout.md` (stub) or
  `docs/architecture/trpc-routers.md` (stub). NOTE: since the
  architecture pages are stubs in this change, the link is forward-
  looking — that's fine, the stubs do exist.
- [x] 11.3 CLAUDE.md "Working Directories & Conventions" section
  (lines ~248-256): Keep the description of `.scratchpad/` (this is
  on the allowlist) but link tracked references to docs/. Add a
  sentence: "Canonical reference docs live under `docs/` — see
  `docs/conventions/no-scratchpad-references.md` for the rule."
- [x] 11.4 CLAUDE.md "Known Security Gaps & Footguns" section: replace
  the inline auth-strategy `§4.9` and `§5.4` references with links to
  the corresponding docs/ section anchors (already done in task 9.1
  for the line-level relink, but verify the surrounding prose still
  makes sense after the relink).
- [x] 11.5 CLAUDE.md "Documentation Maintenance" section: add
  `docs/` to the doc sync targets list. Add a 12th drift point to
  the list: "CLAUDE.md sections covered by `docs/` pages must remain
  thin pointers, not duplicated content."
- [x] 11.6 CLAUDE.md "Environment Notes" → "Dependency Version
  Constraints" sub-section: add the new `@xyd-js/cli` pin entry per
  Decision 7 in design.md.
- [x] 11.7 README.md: thin the "About this fork" paragraph to point at
  `docs/enterprise/fork-posture.md` for the full version.
- [x] 11.8 CONTRIBUTING.md: thin the "Self-host-everything theme"
  section to point at `docs/enterprise/upstream-features.md` and
  `docs/enterprise/auth-strategy.md`.
- [x] 11.9 AGENTS.md: thin the upstream-fetch-sites paragraph to
  point at `docs/architecture/upstream-boundary.md`.
- [x] 11.10 6 Serena memories: each memory keeps its existing role
  (project context for AI agents on activation) but has its
  `.scratchpad/` references rewritten to point at docs/. Specifically
  update: `codebase_structure.md`, `project_overview.md`,
  `style_and_conventions.md`, `suggested_commands.md`,
  `task_completion_checklist.md`, `environment_and_gotchas.md`. (All
  6 already touched in Phase 9; this task verifies the THIN-OUT pass
  was applied not just the relink.)
- [x] 11.11 `.claude/PROJECT_INDEX.md` "Working Directories" line
  (line 268): rewrite to describe `.scratchpad/` as "ephemeral local-
  only working notes; canonical docs live in docs/" and remove all
  specific file references.

## 12. Update .claude/skills + .claude/agents to point at docs/

Phase 9 already relinked the inline `.scratchpad/` references. This
phase audits the skill/agent BEHAVIOR to make sure their workflows
no longer try to read from `.scratchpad/`.

- [x] 12.1 `.claude/skills/docs-drift-check/SKILL.md`: review the
  skill's drift-point list (currently 11 points after the 2026-04-09
  extension) and add a 12th: "tracked files contain `.scratchpad/`
  references". Cross-reference the no-scratchpad-references regression
  guard so the skill alerts contributors before the guard fires.
- [x] 12.2 `.claude/skills/upstream-boundary-check/SKILL.md`: change
  the skill's "open the upstream features inventory" workflow step to
  read from `docs/enterprise/upstream-features.md` instead of
  `.scratchpad/upstream-features-inventory.md`. Update the "snapshot
  refresh" command in the skill body.
- [x] 12.3 `.claude/skills/openspec-propose-gate/SKILL.md`: change the
  skill's `sed -n` example commands to read from
  `docs/enterprise/auth-strategy.md` instead of the scratchpad doc.
  Update the §6 anchor reference style to use markdown anchors
  (`#phase-0-hard-gates`) instead of the scratchpad's plain text
  section markers.
- [x] 12.4 `.claude/skills/verify-strategy-compliance/SKILL.md`: change
  all "read the strategy doc" steps to read from
  `docs/enterprise/auth-strategy.md`. Update the smoke-test reference
  to `docs/enterprise/envoy-smoke-test.md`.
- [x] 12.5 `.claude/skills/phase-0-progress/SKILL.md`: change the
  filesystem-evidence shell commands to grep against
  `docs/enterprise/upstream-features.md` and
  `docs/enterprise/phase-0-gates.md` instead of the scratchpad files.
- [x] 12.6 `.claude/agents/upstream-dependency-auditor.md`: change the
  agent's input format from "an F-entry from .scratchpad/upstream-
  features-inventory.md" to "an F-entry from
  docs/enterprise/upstream-features.md". Update the workflow
  description and the example output template.
- [x] 12.7 `.claude/skills/verify-pin/SKILL.md`: ADD a new section
  for the `@xyd-js/cli` pin alongside the existing Vite/Tailwind/
  Shiki/Electron/Claude/Codex sections. The new section documents:
  current pin, the verify-pin sandbox-install + xyd build workflow,
  and the empirical-validation evidence requirement.

## 13. Final verification and quality gates

- [x] 13.1 Run the four standard quality gates from the repo root:
  ```bash
  bun run ts:check && bun run build && bun test && bun audit
  ```
  Expected:
  - `ts:check`: 88 errors (baseline unchanged, this change does not
    touch TypeScript)
  - `build`: success
  - `test`: 7 guards / 16 tests (was 6/14)
  - `audit`: no new advisories beyond the ~57 pre-existing
- [x] 13.2 Run the docs build separately:
  ```bash
  cd docs && bun install --frozen-lockfile && bun run build
  ```
  Expected: exit 0, ~6.2 MB output to `docs/.xyd/build/client/`,
  build time ~4 minutes.
- [x] 13.3 Run the no-scratchpad-references guard in isolation to
  confirm it's TDD-green:
  ```bash
  bun test tests/regression/no-scratchpad-references.test.ts
  ```
  Expected: 1 pass, 0 fail, 0 violations.
- [x] 13.4 Synthetic violation test: temporarily add the line
  `// see .scratchpad/test.md` to a non-allowlisted tracked file (e.g.,
  `src/main/index.ts`), run the guard, expect 1 fail with the file
  and line in the error message. Revert the synthetic edit.
- [x] 13.5 Verify the docs site renders correctly by starting the dev
  server:
  ```bash
  cd docs && bunx xyd
  ```
  Open `http://localhost:5175` (or the next available port). Click
  through every sidebar entry. Confirm: 5 tabs render, all sidebar
  groups expand, every page loads without 404, the 5 promoted pages
  have content, the 8 native pages have content, the 10 stubs render
  with their TODO pointers, the API Reference tab shows the OpenAPI
  scaffold.
- [x] 13.6 Visual diff check: verify the 1Code logo replaces the
  starter logo in the sidebar header, the favicon is updated, the
  banner copy is "1Code — enterprise fork documentation" not the
  starter "**xyd 0.1.0**" placeholder.
- [x] 13.7 Run `git diff --stat` to capture the change footprint.
  Expected scale: ~25 added, ~50 modified, ~12 deleted, ~3500-4500
  lines changed (most of the volume is the 5 promoted page snapshots).

## 14. Coordinate with in-flight OpenSpec changes

Each of the three in-flight changes still cites `.scratchpad/` in its
own tasks/proposal/design. Patch each one with a brief pointer to the
docs/ replacement. These edits are non-blocking — the in-flight
implementations don't need to wait for them.

- [x] 14.1 `openspec/changes/add-feature-flag-infrastructure/`: add a
  one-line note in `proposal.md` "Citation update: scratchpad
  references in this proposal have been superseded by docs/enterprise/
  pages — see bootstrap-documentation-site change." Update task 6.2
  per Phase 9.31.
- [x] 14.2 `openspec/changes/retire-mock-api-translator/`: same
  one-line note in `proposal.md`. Tasks already updated per Phase 9.32-
  9.34.
- [x] 14.3 `openspec/changes/remove-upstream-sandbox-oauth/`: add the
  one-line note. NOTE: this change references `gate8-preliminary.md`
  which the explore session resolved to leave alone — it's still in
  `.scratchpad/` and the change handles its own archival. The
  references in the change's tasks/proposal pointing at
  `gate8-preliminary.md` are NOT touched by this proposal.

## 15. OpenSpec validate and commit

- [x] 15.1 Run `bunx @fission-ai/openspec@1.2.0 validate
  bootstrap-documentation-site --strict --no-interactive`. Expect
  exit 0. If the validator complains about the requirement format
  (the prior `remove-upstream-sandbox-oauth` change had this issue,
  S3517 in claude-mem), check the spec.md format against the existing
  brand-identity spec template and fix any divergence.
- [x] 15.2 Run `bunx @fission-ai/openspec@1.2.0 list` to confirm the
  change appears in the in-flight list with task counts.
- [x] 15.3 Stage and commit in logical chunks (suggested splits):
  - Commit 1: docs/ scaffold + xyd bump + lockfile (Phases 1-3)
  - Commit 2: 5 promoted pages + 8 native pages + 10 stubs +
    DEPRECATED banners on .scratchpad/ originals (Phases 4-6)
  - Commit 3: regression guard + CI job (Phases 7-8)
  - Commit 4: 91 reference relinks (Phase 9) — single big mechanical
    commit
  - Commit 5: thin out CLAUDE.md / surfaces + skills/agents updates
    (Phases 11-12)
  - Commit 6: in-flight openspec coordination notes + final
    verification (Phases 13-14)
- [x] 15.4 After all commits land on `main`, run
  `bunx @fission-ai/openspec@1.2.0 archive
  bootstrap-documentation-site --yes` to promote
  `specs/documentation-site/spec.md` from the change directory to
  `openspec/specs/documentation-site/spec.md`. This becomes the
  second capability spec in the project (after `brand-identity`).
- [x] 15.5 Run the no-scratchpad-references guard one final time
  AFTER the archive to confirm the archived change directory's
  `.scratchpad/` references (in the design.md "Risk 1" section) are
  in the archive prefix and are correctly allowlisted.
