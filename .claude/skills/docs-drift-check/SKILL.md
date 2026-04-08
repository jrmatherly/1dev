---
name: docs-drift-check
description: Audit CLAUDE.md, README.md, CONTRIBUTING.md, AGENTS.md, and Serena memories against the actual codebase for the 9 drift points documented in CLAUDE.md "Documentation Maintenance" section. Run before any release, after touching schema/routers/dependencies, or when starting a doc cleanup pass. User-only — explicit invocation, not a background task.
disable-model-invocation: true
---

## Documentation Drift Audit

This repo's documentation is split across **5 source-of-truth files** plus **6 Serena memory files**, all of which contain overlapping facts that drift independently. This skill is the codified version of the doc-alignment audit performed on 2026-04-08.

## When to run this skill

- Before tagging a release
- After modifying `src/main/lib/db/schema/index.ts` (schema changes)
- After adding/removing a tRPC router under `src/main/lib/trpc/routers/`
- After bumping any of the load-bearing version pins (Vite, Tailwind, Shiki, Electron, Claude binary, Codex binary)
- After touching `package.json` `claude:download` / `codex:download` script versions
- When CLAUDE.md, README.md, CONTRIBUTING.md, or AGENTS.md is edited substantively
- On user request (`/docs-drift-check`)

## Files to audit

### Source-of-truth docs
1. `CLAUDE.md` — authoritative reference
2. `README.md` — user-facing pitch
3. `CONTRIBUTING.md` — contributor setup
4. `AGENTS.md` — AI quick-reference
5. `openspec/project.md` — brief summary

### Serena memories
6. `.serena/memories/project_overview.md`
7. `.serena/memories/codebase_structure.md`
8. `.serena/memories/environment_and_gotchas.md`
9. `.serena/memories/style_and_conventions.md`
10. `.serena/memories/suggested_commands.md`
11. `.serena/memories/task_completion_checklist.md`

## The 9 drift points (from CLAUDE.md "Documentation Maintenance")

For each drift point, run the listed grep commands and verify the documented value matches the source of truth.

### 1. SDK package names and versions
**Source of truth:** `package.json`
**Grep:** `grep -n '"@anthropic-ai/claude-agent-sdk"' package.json`
**Check:** Does CLAUDE.md/AGENTS.md cite the same SDK version?

### 2. Vite / Tailwind / Shiki version pins (load-bearing)
**Source of truth:** `package.json`
**Grep:** `grep -nE '"(vite|tailwindcss|shiki)":' package.json`
**Check:** CLAUDE.md "Environment Notes" must say Vite 6.x, Tailwind 3.x, Shiki 3.x with the documented reasons.

### 3. Electron EOL date
**Source of truth:** `gh api repos/electron/electron/releases | jq '.[] | select(.tag_name == "v39.0.0") | .published_at'` (computed: EOL = published + 6 months for Electron stable)
**Check:** Memory `environment_and_gotchas` says "Electron 39 EOL is 2026-05-05" — verify still accurate; update if Electron major has been bumped.

### 4. Claude / Codex CLI binary version pins
**Source of truth:** `package.json` `scripts` → `claude:download` and `codex:download`
**Grep:** `grep -nE '"(claude|codex):download":' package.json`
**Check:** CLAUDE.md, AGENTS.md, README.md, and `environment_and_gotchas` memory should all cite the same versions (currently Claude 2.1.96, Codex 0.118.0).

### 5. Release script names
**Source of truth:** `package.json` `scripts` block
**Grep:** `grep -nE '"(release|dist:|sync:|icon:)' package.json`
**Check:** CLAUDE.md "Releasing a New Version" section must list every script that exists, and not list any that don't. Common drift: `dist:upload` was missing pre-2026-04-08.

### 6. Database schema columns
**Source of truth:** `src/main/lib/db/schema/index.ts`
**Grep:** `grep -n "sqliteTable\|notNull\|references" src/main/lib/db/schema/index.ts`
**Check:** CLAUDE.md schema snippet (under "Database (Drizzle ORM)") must list all columns. Common drift: git metadata, PR tracking, streamId were missing pre-2026-04-08.

### 7. tRPC router count
**Source of truth:** `src/main/lib/trpc/routers/index.ts` (`createAppRouter` composition)
**Grep:** `grep -c "import.*Router" src/main/lib/trpc/routers/index.ts`
**Check:** CLAUDE.md and `codebase_structure` memory must say **20 routers in `createAppRouter`** (19 from `routers/` + 1 git router from `../../git`). The `routers/` directory contains 21 files: 19 routers + `index.ts` (composition root) + `agent-utils.ts` (utility, not a router).

### 8. Renderer feature subdirectories
**Source of truth:** `ls src/renderer/features/agents/`
**Check:** CLAUDE.md architecture diagram must list all `agents/` subdirs including `components/`, `lib/`, `utils/`, `constants.ts`. Common drift: those four were missing pre-2026-04-08.

### 9. Quality-gate naming
**Check:** Every doc that mentions quality gates must say **both `ts:check` AND `build`** are required (neither is "primary"). Grep all 5 source-of-truth docs for "quality gate" and verify wording.
**Grep:** `grep -n "ts:check\|quality gate" CLAUDE.md README.md CONTRIBUTING.md AGENTS.md openspec/project.md`

### Bonus (10) — Hosted-vs-OSS feature claims
**Source of truth:** `grep -rn "remoteTrpc\." src/renderer/` and `grep -rn "fetch(\`\${apiUrl}" src/main/ src/renderer/`
**Check:** README.md "Highlights" and "Removed in this fork" lists must accurately reflect which features depend on the upstream backend. Cross-reference against `.scratchpad/upstream-features-inventory.md`.

## Output format

Produce a structured report:

```markdown
# Documentation Drift Audit — <date>

## Drift point 1: SDK package names
- ✅ CLAUDE.md cites version `0.2.45` matching package.json
- ❌ AGENTS.md still says `0.2.43` (outdated)

## Drift point 2: Version pins
[...]

## Summary
- N drift points checked
- M issues found
- K recommended fixes (listed below with file:line citations)

## Recommended fixes
1. File: AGENTS.md:35 — change `0.2.43` to `0.2.45`
[...]
```

## Related artifacts

- `CLAUDE.md` "Documentation Maintenance" section — the canonical drift-points list (this skill is its operational form)
- `.serena/memories/task_completion_checklist.md` — references this skill under "If Touching Documentation Inventory"
- The 2026-04-08 audit session that produced this skill
