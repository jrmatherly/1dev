---
paths:
  - "openspec/**"
---

# OpenSpec rules — 1.2.0 workflow conventions

This repo uses **OpenSpec 1.2.0** for spec-driven change proposals. The CLI is installed globally but **mise shims may not be on the Bash tool's PATH** in non-login shells — use `bunx @fission-ai/openspec@1.2.0` instead of bare `openspec` in automation.

## Supported commands

```bash
bunx @fission-ai/openspec@1.2.0 new change <id>
bunx @fission-ai/openspec@1.2.0 instructions <artifact>
bunx @fission-ai/openspec@1.2.0 validate --strict --no-interactive
bunx @fission-ai/openspec@1.2.0 validate --all --strict --no-interactive
bunx @fission-ai/openspec@1.2.0 list
bunx @fission-ai/openspec@1.2.0 status --change <id>
bunx @fission-ai/openspec@1.2.0 show <id>
bunx @fission-ai/openspec@1.2.0 archive <id>
```

## MODIFIED Requirements rule (baseline constraint)

**`## MODIFIED Requirements` requires an archived baseline.** You can only use `MODIFIED` against a capability spec that lives under `openspec/specs/<capability>/spec.md`.

- **Capabilities still inside unarchived `openspec/changes/<id>/specs/` directories are NOT baselines.**
- Use `## ADDED Requirements` on a **new** capability instead, OR
- Archive the source change first with `bunx @fission-ai/openspec@1.2.0 archive <id>` to promote its capabilities to baselines.

This rule is enforced by `openspec validate --strict`.

## Phase 0 gate scope rule

**Gate text in `docs/enterprise/auth-strategy.md` §6 (e.g., "Resolve sandbox dependency") names exactly what a gate closes. Do NOT expand scope within a single gate.**

If a gate's implementation reveals additional work (new auth mechanism, new credential store, three-segment model), that additional work needs **its own OpenSpec change proposal**, not a bigger Layer 1.

This rule is load-bearing — violating it triggered the 4-reviewer Gate #8 audit rework in a prior session.

## `openspec/config.yaml` — active context injection

`openspec/config.yaml` has an active `context` + `rules` block that is injected into every `/opsx:propose` and `/opsx:apply` artifact generation. Keep it concise and up-to-date when the tech stack or constraints change.

## Baseline capability specs

Canonical capability baselines under `openspec/specs/` (count grows when changes archive). Current list:

```bash
ls -d openspec/specs/*/ 2>/dev/null | xargs -n1 basename
```

## Workflow skills

Use these skills for the OpenSpec workflow:

- `/opsx:explore` — thinking partner for exploring ideas
- `/opsx:propose` — scaffold a new change with all artifacts
- `/opsx:apply` — implement tasks from a change
- `/opsx:verify` — validate implementation before archiving
- `/opsx:archive` — archive a completed change

## Related canonical docs

- `openspec/config.yaml` — project schema, context, and rules
- `docs/enterprise/auth-strategy.md` §6 — Phase 0 gate list with exact scope
