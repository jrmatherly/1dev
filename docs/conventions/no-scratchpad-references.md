---
title: No .scratchpad/ References from Tracked Files
icon: alert-triangle
---

# No .scratchpad/ References {subtitle="Tracked files must only reference tracked files"}

## The Rule

**Tracked files MUST NOT contain a literal reference to a path under `.scratchpad/`.** The directory `.scratchpad/` is gitignored (line 15 of `.gitignore`) and serves as the local-only working-notes surface for in-flight strategy work. References to its contents from tracked files create dangling pointers for any clone, contributor, or CI run that does not have the original author's local state.

## What Counts as a Reference

Any line containing the literal substring `.scratchpad/` (including the trailing slash). Prose mentions of "scratchpad" without the literal `.scratchpad/` substring are NOT references and are permitted.

## Enforcement

The rule is enforced by `tests/regression/no-scratchpad-references.test.ts`, which runs as part of the `bun test` quality gate on every PR.

## Allowlist

The following files are exempt:

| File | Reason |
|------|--------|
| `.gitignore` | Contains the gitignore rule itself |
| `CLAUDE.md` | Describes `.scratchpad/` as a concept in "Working Directories" |
| `.claude/skills/docs-drift-check/SKILL.md` | Audits `.scratchpad/` content for drift |
| `tests/regression/no-scratchpad-references.test.ts` | Contains the detection regex |
| `openspec/changes/archive/**` | Immutable historical records |

## What to Do Instead

When you have content that should be referenced from tracked files:

1. **Author it as a `docs/` page** — this is the canonical home for fork documentation
2. **Reference the `docs/` page** from CLAUDE.md, skills, agents, test comments, etc.
3. **Keep `.scratchpad/` for ephemeral notes** — strategy drafts, research, things that haven't crystallized yet

## Capability Spec

The normative source for this rule is the `documentation-site` capability spec at `openspec/specs/documentation-site/spec.md` (after archive). It defines five SHALL/MUST requirements including this one.
