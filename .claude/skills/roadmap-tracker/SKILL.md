---
name: roadmap-tracker
description: View, add, or complete items on the centralized project roadmap at docs/operations/roadmap.md. Use when starting a session to see outstanding work, when deferring work to record it, or when completing work to update the tracker. Triggers on "roadmap", "outstanding work", "what's left", "defer", "follow-up".
---

# Roadmap Tracker

This skill reads and updates the canonical roadmap at `docs/operations/roadmap.md` — the single source of truth for all outstanding work items, deferred tasks, and follow-up recommendations.

## Why this exists

Work items were previously scattered across CLAUDE.md sections, commit messages, OpenSpec proposal "section 10" follow-ups, and Serena memories. This made it impossible for a new session to know "what's left to do?" without reading 5+ files. The roadmap centralizes everything in one CI-validated, docs-site-rendered page.

## Operations

### List outstanding items

Read the canonical roadmap and summarize by priority:

```bash
# Show all non-completed entries grouped by priority
grep -E "^### \[" docs/operations/roadmap.md
```

Expected output: one line per item with status tag and title.

For a richer view, read the full file:

```bash
cat docs/operations/roadmap.md
```

### Add a new item

When deferring work, append an entry to the appropriate priority section in `docs/operations/roadmap.md`. Use this template:

```markdown
### [Status] Title

**Added:** YYYY-MM-DD
**Scope:** What needs to be done (1-3 sentences).
**Effort:** Trivial / Small / Medium / Medium-Large / Large
**Prereqs:** What must be done first (or "None")
**Canonical reference:** Link to the relevant doc, OpenSpec change, or code location
```

Status must be one of: `Ready`, `Blocked`, `In Progress`, `Deferred`, `Cleanup`.

Place the entry in the correct priority section:
- **P1** — High priority, should be done soon
- **P2** — Medium priority, important but not urgent
- **P3** — Low priority, opportunistic

### Complete an item

When an item is done:

1. Remove the entry from its priority section
2. Add a row to the "Recently Completed" table at the bottom:

```markdown
| YYYY-MM-DD | Item description | `commit-hash` or `change-name` archived |
```

3. If the item was an OpenSpec change, it should also be archived via `/opsx:archive`.

### Check for drift

Verify the roadmap is up to date by cross-checking against:

```bash
# Active OpenSpec changes (should be listed as "In Progress" on roadmap)
bunx @fission-ai/openspec@1.2.0 list --json 2>/dev/null

# F-entry restoration status (canonical: docs/enterprise/upstream-features.md)
grep -E "^### F[0-9]" docs/enterprise/upstream-features.md

# ts:check baseline (canonical: .claude/.tscheck-baseline)
cat .claude/.tscheck-baseline
```

If any active change or known gap is missing from the roadmap, add it.

## Canonical source

- **Roadmap page:** `docs/operations/roadmap.md` (rendered in docs site under Operations tab)
- **Behavioral rule:** `.claude/rules/roadmap.md` (loaded every session)
- **This skill:** `.claude/skills/roadmap-tracker/SKILL.md`

The roadmap is the canonical source. CLAUDE.md points to it but does not contain the items.
