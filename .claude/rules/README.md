# .claude/rules/

This directory contains Claude Code **rule files** — markdown files loaded automatically into Claude's context to shape its behavior on this project.

## How rules differ from CLAUDE.md

| | CLAUDE.md | `.claude/rules/*.md` |
|---|-----------|---------------------|
| **Loaded when** | Every session (full file, always) | Every session OR only when `paths:` matches a file Claude is working on |
| **Scope** | Global identity, quick commands, architecture summary | Topic-specific behavioral rules |
| **Size target** | <200 lines (official Claude Code docs recommendation) | Keep each rule focused on one topic |
| **Purpose** | "Who am I working on, what are the most critical rules" | "When I touch files matching X, these are the constraints" |

## How rules differ from skills

| | Rules | Skills |
|---|-------|--------|
| **Loaded when** | Every session or path-scoped (always-on behavioral guidance) | On-demand when invoked via `/skill-name` or when the description matches |
| **Format** | Plain markdown + optional `paths:` frontmatter | Markdown with `SKILL.md` entry point + optional supporting files |
| **Purpose** | Guidelines, constraints, standing rules | Workflows, step-by-step playbooks, commands |
| **Example** | "All auth code MUST use credential-store.ts" | "Scaffold a new regression guard following the pattern in X" |

## Current rules

### Global (loaded every session)
- [`scratchpad.md`](./scratchpad.md) — Never reference `.scratchpad/` from tracked files

### Path-scoped (loaded only when matching files are being worked on)
- [`auth-env-vars.md`](./auth-env-vars.md) — **HARD RULE**: Never inject bearer tokens via env vars. Scope: `src/main/**/*auth*`, `*claude*`, `*codex*`, `*enterprise*`
- [`credential-storage.md`](./credential-storage.md) — All credential encryption through `credential-store.ts`. Scope: `src/main/**/*.ts`
- [`database.md`](./database.md) — Drizzle schema as source of truth, migration workflow. Scope: `src/main/lib/db/**`, `drizzle/**`
- [`openspec.md`](./openspec.md) — OpenSpec 1.2.0 workflow, MODIFIED Requirements rule, Phase 0 gate scope rule. Scope: `openspec/**`
- [`testing.md`](./testing.md) — TDD red-state rule, regression guard requirements, quality gates. Scope: `tests/**`, `src/**/*.test.ts`
- [`tscheck-baseline.md`](./tscheck-baseline.md) — Baseline file is load-bearing, hook behavior. Scope: `**/*.ts`, `**/*.tsx`
- [`upstream-boundary.md`](./upstream-boundary.md) — F-entry catalog coverage, F1 boundary preservation. Scope: `src/renderer/**/*.{ts,tsx}`

## Adding a new rule

1. Create `<topic>.md` in this directory
2. Add `paths:` frontmatter if the rule should only apply to specific files (use glob patterns matching how Claude searches files)
3. Keep it focused on **one topic**
4. Link to the canonical `docs/` page if one exists
5. Update this README's "Current rules" section

## Why this structure

Claude Code's official docs (`https://code.claude.com/docs/en/memory`) recommend keeping CLAUDE.md **under 200 lines** and splitting detailed content into `.claude/rules/` files. Rules load alongside CLAUDE.md but path-scoped rules only load when Claude is working on matching files, saving context tokens in sessions that don't touch those files.

## Related

- Canonical docs live under `docs/` — rules should link to the canonical home, not duplicate it
- `openspec/specs/documentation-site/spec.md` — the architectural rule that mandates `docs/` as the canonical home
