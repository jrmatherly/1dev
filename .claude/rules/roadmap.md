# Deferred work goes in the roadmap

Outstanding work, deferred items, and follow-up recommendations are tracked in [`docs/operations/roadmap.md`](../../docs/operations/roadmap.md) — the **single source of truth** for what needs to be done across sessions.

## Rule

- **DO NOT** track deferred work in commit messages, code comments, CLAUDE.md, or scattered doc sections.
- **DO** add an entry to `docs/operations/roadmap.md` when deferring work, with: date, scope, effort, prereqs, and canonical reference.
- **DO** move completed items to the "Recently Completed" table at the bottom of the roadmap.
- **DO** read the roadmap at the start of any session to understand what's queued and what's blocked.

## Operations

Use the `roadmap-tracker` skill (`/roadmap`) for structured operations: list items, add new entries, mark items complete.

## Canonical reference

- Roadmap page: [`docs/operations/roadmap.md`](../../docs/operations/roadmap.md)
- Skill: `.claude/skills/roadmap-tracker/SKILL.md`
