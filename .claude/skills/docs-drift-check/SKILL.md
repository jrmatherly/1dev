---
name: docs-drift-check
description: Audit CLAUDE.md, README.md, CONTRIBUTING.md, AGENTS.md, Serena memories, and docs/ pages against the actual codebase for the documented drift points. Run before any release, after touching schema/routers/dependencies, or when starting a doc cleanup pass. User-only — explicit invocation, not a background task.
disable-model-invocation: true
---

## Documentation Drift Audit

This repo's documentation lives across multiple source-of-truth surfaces, all of which contain overlapping facts that drift independently. The canonical reference home is `docs/` (enforced by `openspec/specs/documentation-site/spec.md`), but CLAUDE.md, README.md, CONTRIBUTING.md, AGENTS.md, and Serena memories all contain mirrors or summaries that must stay consistent.

This skill is the codified version of the doc-alignment audit performed throughout 2026-04.

## When to run this skill

- Before tagging a release
- After modifying `src/main/lib/db/schema/index.ts` (schema changes)
- After adding/removing a tRPC router under `src/main/lib/trpc/routers/`
- After bumping any of the load-bearing version pins (Vite, Tailwind, Shiki, Electron, Claude binary, Codex binary)
- After touching `package.json` `claude:download` / `codex:download` script versions
- When CLAUDE.md, README.md, CONTRIBUTING.md, or AGENTS.md is edited substantively
- On user request (`/docs-drift-check`)

## Documentation hierarchy (post-restructure)

### Canonical source-of-truth (docs/)
The `docs/` xyd-js site is the authoritative home for architectural facts, conventions, and runbooks:

- `docs/architecture/` — codebase layout, database, tech stack, tRPC routers, upstream boundary
- `docs/conventions/` — brand taxonomy, feature flags, pinned deps, quality gates, regression guards, tscheck baseline, no-scratchpad-references
- `docs/operations/` — cluster access, debugging first install, env gotchas, release
- `docs/enterprise/` — auth strategy, auth fallback, cluster facts, envoy smoke test, fork posture, phase-0-gates, upstream features

### Mirror surfaces (must stay consistent with docs/)
1. `CLAUDE.md` — identity, critical rules, architecture summary, quick commands, pointers to docs/
2. `README.md` — user-facing pitch
3. `CONTRIBUTING.md` — contributor setup
4. `AGENTS.md` — AI quick-reference
5. `.claude/PROJECT_INDEX.md` — repo navigation map
6. `openspec/config.yaml` — OpenSpec project schema, context, and rules

### Serena memories (personal Claude context)
7. `.serena/memories/project_overview.md`
8. `.serena/memories/codebase_structure.md`
9. `.serena/memories/environment_and_gotchas.md`
10. `.serena/memories/style_and_conventions.md`
11. `.serena/memories/suggested_commands.md`
12. `.serena/memories/task_completion_checklist.md`

### Behavioral rules (Claude Code)
13. `.claude/rules/*.md` — behavioral rules loaded automatically by Claude Code

## The drift points

For each drift point, the **ground truth** is the code or config file. All mirror surfaces must agree with ground truth. The canonical `docs/` page (if present) takes precedence over CLAUDE.md and any mirror.

### 1. SDK package names and versions
**Ground truth:** `package.json`
**Grep:** `grep -n '"@anthropic-ai/claude-agent-sdk"' package.json`
**Mirrors:** CLAUDE.md tech stack, AGENTS.md SDK version, `docs/architecture/tech-stack.md`

### 2. Vite / Tailwind / Shiki version pins (load-bearing)
**Ground truth:** `package.json`
**Canonical doc:** `docs/conventions/pinned-deps.md`
**Grep:** `grep -nE '"(vite|tailwindcss|shiki)":' package.json`
**Check:** Both ground truth and canonical doc must agree. CLAUDE.md summary, `environment_and_gotchas` memory, and README must all match.

### 3. Electron EOL date and version pin
**Ground truth:** `package.json` + `gh api repos/electron/electron/releases`
**Canonical doc:** `docs/conventions/pinned-deps.md` (Electron section), `docs/enterprise/phase-0-gates.md` (Gate #14)
**Check:** Current Electron pin matches across surfaces. EOL date for the current major is still in the future.

### 4. Claude / Codex CLI binary version pins
**Ground truth:** `package.json` `scripts` → `claude:download` and `codex:download`
**Canonical doc:** `docs/conventions/pinned-deps.md`
**Grep:** `grep -nE '"(claude|codex):download":' package.json`
**Check:** CLAUDE.md summary, AGENTS.md, README.md, and `environment_and_gotchas` memory should all cite the same versions.

### 5. Release script names
**Ground truth:** `package.json` `scripts` block
**Canonical doc:** `docs/operations/release.md`
**Grep:** `grep -nE '"(release|dist:|icon:)' package.json`
**Check:** The canonical doc must list every script that exists, and not list any that don't.

### 6. Database schema tables and columns
**Ground truth:** `src/main/lib/db/schema/index.ts`
**Canonical doc:** `docs/architecture/database.md`
**Grep:** `grep -cE "^export const \w+ = sqliteTable" src/main/lib/db/schema/index.ts` (table count)
**Check:** Canonical doc lists all tables. CLAUDE.md architecture summary cites the correct count. `codebase_structure` memory cites the correct count. Use the `db-schema-auditor` agent for a full drift report.

### 7. tRPC router count
**Ground truth:** `src/main/lib/trpc/routers/index.ts` (`createAppRouter` composition)
**Canonical doc:** `docs/architecture/trpc-routers.md`
**Grep:** `sed -n '/createAppRouter/,/^}/p' src/main/lib/trpc/routers/index.ts | grep -cE "^\s+\w+:"`
**Check:** Canonical doc lists every router. CLAUDE.md architecture summary cites the correct total. Use the `trpc-router-auditor` agent for a full drift report.

### 8. Renderer feature subdirectories
**Ground truth:** `ls src/renderer/features/agents/`
**Canonical doc:** `docs/architecture/codebase-layout.md`
**Check:** Canonical doc must list all `agents/` subdirs. CLAUDE.md summary tree matches.

### 9. Quality-gate naming
**Ground truth:** `.github/workflows/ci.yml`
**Canonical doc:** `docs/conventions/quality-gates.md`
**Grep:** `grep -nE "ts:check|quality gate" CLAUDE.md README.md CONTRIBUTING.md AGENTS.md openspec/config.yaml`
**Check:** All five CI gates must be documented consistently: `ts:check`, `build`, `test`, `audit`, `docs-build`.

### 10. Hosted-vs-OSS feature claims
**Ground truth:** `grep -rn "remoteTrpc\." src/renderer/` and `grep -rn "fetch(\`\${apiUrl}" src/main/ src/renderer/`
**Canonical doc:** `docs/architecture/upstream-boundary.md`, `docs/enterprise/upstream-features.md`
**Check:** README.md "Highlights" and "Removed in this fork" lists must accurately reflect which features depend on the upstream backend.

### 11. Deleted-file references in docs
**Ground truth:** `git log --diff-filter=D --name-only --pretty=format: | sort -u` (every file ever deleted from the repo), cross-checked against the current git HEAD (`git ls-tree -r HEAD --name-only`) to confirm the file is still gone.
**Check:** Every file that was deleted in a recent commit MUST NOT be referenced by name in `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.claude/PROJECT_INDEX.md`, `.claude/skills/*/SKILL.md`, `.claude/rules/*.md`, or `.serena/memories/*.md`. Documentation references to deleted scripts/modules are the most common doc-drift failure mode in this repo.

**Operational steps:**
1. Enumerate recently-deleted files from the last N commits:
   ```bash
   git log --since="30 days ago" --diff-filter=D --name-only --pretty=format: | sort -u
   ```
2. For each deleted file `F`, grep the doc corpus for the **basename** (not the full path, since docs may use relative references):
   ```bash
   grep -rn "$(basename F)" CLAUDE.md README.md CONTRIBUTING.md AGENTS.md .claude/PROJECT_INDEX.md .claude/skills/ .claude/rules/ .serena/memories/ docs/ 2>/dev/null | grep -v "^Binary"
   ```
3. Report every hit — each is a potential stale reference needing removal or replacement.

### 12. Regression guard count and list
**Ground truth:** `ls tests/regression/*.test.ts | wc -l`
**Canonical doc:** `docs/conventions/regression-guards.md`
**Check:** Canonical doc lists every guard. CLAUDE.md critical-rules summary cites the correct count.

### 13. Baseline spec count
**Ground truth:** `ls -d openspec/specs/*/ | wc -l`
**Check:** CLAUDE.md pointers section and any docs that cite a count must match.

### 14. Stale CLAUDE.md section references
**Context:** Post-restructure (April 2026), CLAUDE.md was trimmed from 434 lines to <200 lines. Skills, agents, and docs that previously referenced "CLAUDE.md 'Working Directories' section" or hardcoded line numbers may be stale.
**Grep:** `grep -rn "CLAUDE\.md line [0-9]\|CLAUDE\.md \"[^\"]" .claude/ .serena/memories/ docs/ 2>/dev/null`
**Check:** Any hardcoded line numbers or section quotes must still match the current CLAUDE.md structure. If CLAUDE.md no longer has the cited section, the reference should point at the corresponding `docs/` page or `.claude/rules/` file.

## Output format

Produce a structured report:

```markdown
# Documentation Drift Audit — <date>

## Drift point 1: SDK package names
- Ground truth: `@anthropic-ai/claude-agent-sdk` at version X
- ✅ CLAUDE.md cites X
- ❌ AGENTS.md still says Y (outdated)
- ✅ docs/architecture/tech-stack.md cites X

## Drift point 2: Version pins
[...]

## Summary
- N drift points checked
- M issues found
- K recommended fixes (listed below with file:line citations)

## Recommended fixes
1. File: AGENTS.md:35 — change `0.2.43` to current version
[...]
```

## Related artifacts

- `docs/conventions/quality-gates.md` — canonical quality gate list
- `docs/conventions/pinned-deps.md` — canonical version pin list
- `docs/conventions/regression-guards.md` — canonical regression guard list
- `.claude/agents/db-schema-auditor.md` — automated DB schema drift check
- `.claude/agents/trpc-router-auditor.md` — automated tRPC router drift check
- `openspec/specs/documentation-site/spec.md` — the rule that docs/ is canonical and mirrors must link
- `.serena/memories/task_completion_checklist.md` — references this skill under "If Touching Documentation Inventory"
