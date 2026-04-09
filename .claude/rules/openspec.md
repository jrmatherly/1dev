---
paths:
  - "openspec/**"
---

# OpenSpec rules — 1.2.0 workflow conventions

This repo uses **OpenSpec 1.2.0** for spec-driven change proposals. The CLI is installed globally but **mise shims may not be on the Bash tool's PATH** in non-login shells — use `bunx @fission-ai/openspec@1.2.0` instead of bare `openspec` in automation.

## CLI reference (v1.2.0)

`openspec` is installed globally via mise. In non-login shells (Bash tool), use `bunx @fission-ai/openspec@1.2.0` if `openspec` is not on PATH.

```bash
# Discovery & inspection
openspec list                          # List active changes (default)
openspec list --specs                  # List baseline specs with requirement counts
openspec view                          # Interactive dashboard (specs + changes summary)
openspec show <change-or-spec>         # Show details for a change or spec
openspec status --change <id>          # Artifact completion status (JSON with --json)

# Change lifecycle
openspec new change <id>               # Create a new change proposal
openspec instructions <artifact>       # Get enriched instructions for an artifact
openspec instructions apply --change <id>  # Get apply instructions with task list
openspec validate --strict --no-interactive  # Validate current change
openspec validate --all --strict --no-interactive  # Validate all changes
openspec archive <id>                  # Archive completed change + sync baseline specs

# Spec management
openspec spec                          # Manage specifications
openspec schemas                       # List available workflow schemas

# Configuration
openspec config                        # View/modify global config
openspec init [path]                   # Initialize OpenSpec in a project
openspec update [path]                 # Update instruction files
```

**JSON output:** Most commands accept `--json` for machine-readable output (used by `/opsx:apply` and `/opsx:archive` skills).

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

## Baseline spec format (load-bearing)

When archiving a change, delta spec headings (`## ADDED Requirements`, `## MODIFIED Requirements`) **must** be converted to `## Requirements` in the baseline. The CLI only counts requirements under `## Requirements`.

Required baseline structure:
```markdown
# <capability-name> Specification
## Purpose
<description>
## Requirements
### Requirement: ...
```

Missing the H1 or using `## ADDED Requirements` causes the CLI to report "0 requirements" for that spec.

## Tasks format (load-bearing)

`tasks.md` must use **checkbox format** — the CLI parses `- [ ]` and `- [x]` to count/track tasks. Narrative `### Task N:` headers with bullet points are invalid and report as "No tasks" in `openspec list`.

Required structure:
```markdown
## 1. <Phase name>

- [ ] 1.1 <First action>
- [ ] 1.2 <Second action>

## 2. <Next phase>

- [ ] 2.1 <Action>
```

`/opsx:apply` iterates through tasks and flips `- [ ]` → `- [x]` as work progresses. Without checkboxes, apply cannot track completion and archive cannot detect doneness.

## Baseline capability specs

Canonical capability baselines under `openspec/specs/` (count grows when changes archive — currently 9 specs, 45 requirements). Current list:

```bash
ls -d openspec/specs/*/ 2>/dev/null | xargs -n1 basename
```

## Workflow skills

Use these skills for the OpenSpec workflow (full lifecycle):

- `/opsx:explore` — thinking partner for exploring ideas and investigating problems
- `/opsx:propose` — scaffold a new change with all artifacts in one step
- `/openspec-propose-gate` — scaffold from a Phase 0 hard gate specifically
- `/opsx:apply <name>` — implement tasks from a change (reads context files, loops through tasks)
- `/opsx:verify <name>` — validate implementation matches change artifacts before archiving
- `/opsx:archive <name>` — archive a completed change, sync delta specs to baselines

For inspection, use CLI directly: `openspec list --specs`, `openspec view`, `openspec show <name>`, `openspec status --change <name> --json`.

## Related canonical docs

- `openspec/config.yaml` — project schema, context, and rules
- `docs/enterprise/auth-strategy.md` §6 — Phase 0 gate list with exact scope
