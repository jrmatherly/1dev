---
name: session-sync
description: End-of-task sync — update CLAUDE.md, rebuild code graph, sync Serena memories, check roadmap drift, and commit. Run after completing any significant work to ensure all drift surfaces are current.
---

## End-of-Task Session Sync

Run this after completing any significant task, feature, or migration to ensure all documentation surfaces stay current.

### What this skill does (in order)

1. **Rebuild code-review graph** — incremental update to capture code changes
2. **Reflect on session learnings** — identify what's new, what changed, what future sessions need to know
3. **Check CLAUDE.md** — verify the project root CLAUDE.md is current (version pins, architecture summary, commands)
4. **Sync Serena memories** — read all 6 memories, identify drift against current codebase state, apply targeted edits
5. **Check roadmap** — verify `docs/operations/roadmap.md` is current (active items match OpenSpec, recently completed items are recorded)
6. **Commit + push** — single commit covering all sync edits (do NOT commit code changes — only doc/memory drift fixes)

### How to use

Invoke at the end of any session where you made substantive changes:

```
/session-sync
```

Or invoke with a scope hint:

```
/session-sync after Electron 41 upgrade + CI workflow fixes
```

The scope hint tells the skill what specifically to check for drift (version numbers, new files, new patterns, etc.).

### Behavioral rules

- **Read before writing** — always read the current state of each surface before proposing edits. Don't assume prior session's context is still accurate.
- **Targeted edits only** — fix what's stale, don't rewrite entire files. One-line fixes are preferred over paragraph rewrites.
- **Don't duplicate content** — CLAUDE.md links to `docs/`, Serena memories summarize for session priming, `docs/` is canonical. Each surface has a role; don't copy content between them.
- **Verify with ground truth** — before claiming a count (tables, routers, guards, errors), grep the codebase. Don't trust the existing memory value.
- **Exclude parallel session WIP** — if `git status` shows changes from another session's in-progress work, don't stage those files. Commit only your drift-sync edits.
- **Run the docs build** — `cd docs && bun run build` must pass after edits to `docs/` pages.

### Surfaces to check

| Surface | Source of truth | What drifts |
|---|---|---|
| `CLAUDE.md` | Codebase + `docs/` | Version pins, architecture summary (Electron/TS/Vite version), commands, feature list |
| `.serena/memories/project_overview` | `CLAUDE.md` + `docs/` | Tech stack versions, current state, active OpenSpec changes, upgrade execution order |
| `.serena/memories/codebase_structure` | `src/` + `drizzle/` | Table count, router count, file descriptions, directory tree |
| `.serena/memories/environment_and_gotchas` | `.env` + CI + tooling | Version pins, CI/CD details, upgrade blockers, tool gotchas |
| `.serena/memories/suggested_commands` | `package.json` + `.claude/rules/` | Guard/test counts, quality gate baselines, rule index, skill list |
| `.serena/memories/style_and_conventions` | Codebase patterns | TS baseline, state management patterns, brand taxonomy |
| `.serena/memories/task_completion_checklist` | `docs/conventions/` | Guard counts, OpenSpec spec counts, quality gate details |
| `docs/operations/roadmap.md` | `openspec list` + `git log` | Active changes, recently completed items, blocked items |
| `.claude/PROJECT_INDEX.md` | `src/` + `scripts/` + `docs/` | File descriptions, build pipeline diagram, script inventory |
| Code-review graph | `.code-review-graph/graph.db` | Node/edge counts, last-updated timestamp |

### Quick verification commands

```bash
# Current TS baseline (should match memories)
cat .claude/.tscheck-baseline

# Active OpenSpec changes (should match roadmap active items)
bunx @fission-ai/openspec@1.2.0 list --json 2>/dev/null | grep -v Warning

# Regression guard count (should match memories)
ls tests/regression/*.test.ts | wc -l

# tRPC router count (should match CLAUDE.md + memories)
grep -c 'Router' src/main/lib/trpc/routers/index.ts

# Drizzle table count (should match CLAUDE.md + memories)
grep -c 'sqliteTable' src/main/lib/db/schema/index.ts

# Roadmap entry count
grep -cE '^### \[' docs/operations/roadmap.md
```

### Commit convention

When committing session-sync edits, use:

```
docs: session sync — <what changed> + drift surface updates
```

Examples:
- `docs: session sync — Electron 41 + CI fixes + drift surface updates`
- `docs: session sync — release pipeline migration + drift surface updates`

### Related

- `.claude/rules/roadmap.md` — rule requiring deferred work goes in the roadmap
- `.claude/skills/roadmap-tracker/SKILL.md` — structured roadmap operations
- `/docs-drift-check` — targeted drift check for specific surfaces (schema, routers, version pins)
