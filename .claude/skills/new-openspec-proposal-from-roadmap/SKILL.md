---
name: new-openspec-proposal-from-roadmap
description: Scaffold a new OpenSpec change proposal by extracting scope, prereqs, and canonical references from an existing docs/operations/roadmap.md entry. Use when promoting a [Ready] or [Deferred] roadmap item into an active OpenSpec change. Delegates to /opsx:propose after pre-populating the proposal content, which saves ~5 min of manual scope-copying per proposal and eliminates "I forgot to capture the effort estimate" drift.
disable-model-invocation: true
---

# New OpenSpec Proposal From Roadmap

A user-invocable skill for promoting a roadmap item into an active OpenSpec change. This skill is **user-only** (`disable-model-invocation: true`) because it initiates multi-file artifact creation (proposal.md, design.md, tasks.md, specs/) via `openspec new change` — a side-effecting operation the operator should explicitly trigger, not Claude.

## Why this skill exists

The `docs/operations/roadmap.md` file is the canonical ledger of deferred work. Each entry contains: scope, effort estimate, prereqs, and canonical references (e.g., design-doc decisions, prior change artifacts). When an operator decides to promote an entry into an active OpenSpec change, the manual process is:

1. Read the roadmap entry
2. Run `/opsx:propose <description>` and re-type the scope into the description field
3. Hand-edit `proposal.md` to copy the prereqs + canonical references
4. Flip the roadmap entry from `[Ready]` to `[In progress]` or remove it

Steps 2-3 are error-prone. Last session this manifested as an OpenSpec proposal whose `proposal.md` didn't cite the `design.md §Decision 4` link from the original roadmap entry, which surfaced during archive as "where did we decide this?"

This skill automates the extract-and-populate step so the operator only does the interactive `/opsx:propose` answers.

## Workflow

### Step 1 — Identify the roadmap entry

```bash
grep -nE "^### \[Ready\]|^### \[Deferred\]" docs/operations/roadmap.md
```

The operator picks a target entry by its `### [<status>] <title>` heading. The skill accepts the heading as its argument:

```
/new-openspec-proposal-from-roadmap 1code-api LiteLLM virtual-key auto-provisioning
```

### Step 2 — Extract fields

Parse the target entry for the four fields:

```bash
# Find the line range for the entry
start_line=$(grep -n "^### \[Ready\] <title>" docs/operations/roadmap.md | head -1 | cut -d: -f1)
end_line=$(grep -nE "^### |^---|^## " docs/operations/roadmap.md | awk -F: -v start="$start_line" '$1 > start {print $1; exit}')
sed -n "${start_line},${end_line}p" docs/operations/roadmap.md
```

Fields to extract:
- `**Added:**` — date the entry was filed
- `**Scope:**` — body text
- `**Effort:**` — sizing label (Small / Medium / Medium-Large / Large)
- `**Prereqs:**` — comma-separated dependencies
- `**Canonical reference:**` — links to `design.md` sections, prior change artifacts, or cluster docs

### Step 3 — Derive a change name

Slugify the entry title to snake-case-with-dashes, matching OpenSpec's naming convention:

```
"1code-api LiteLLM virtual-key auto-provisioning"
→ "add-1code-api-litellm-virtual-key-provisioning"
```

Prefix with a verb (`add-`, `upgrade-`, `remediate-`, `wire-`) per the OpenSpec naming norm in `.claude/rules/openspec.md`.

### Step 4 — Build the proposal.md header

Pre-populate a proposal header block that the operator can paste when `/opsx:propose` prompts for the description:

```markdown
## Why

<Scope field body, verbatim from roadmap>

This change was queued on <Added date> in `docs/operations/roadmap.md` (effort: <Effort>).

## Prereqs

<Prereqs field body, as a bullet list>

## Canonical references

<Canonical reference field, formatted as a bullet list of markdown links>

## Roadmap entry

The originating roadmap entry will be removed from `docs/operations/roadmap.md` upon successful archive of this change (via the Recently Completed table update).
```

### Step 5 — Invoke /opsx:propose

Emit a suggested `/opsx:propose` invocation with the derived change name + pre-populated description:

```
/opsx:propose <derived-name>

When the propose skill prompts for `## Why` content, paste:
<the pre-built proposal-md header block>
```

### Step 6 — Post-propose cleanup

Remind the operator to flip the roadmap entry to `[In progress]` (or remove it entirely if it's being fully absorbed into the new change) once the change directory exists under `openspec/changes/<name>/`:

```bash
# Flip the roadmap header marker
sed -i '' 's/^### \[Ready\] <title>/### [In progress] <title>/' docs/operations/roadmap.md
```

The `In progress` marker tells future sessions not to re-promote the same entry.

## Rules

- **User-invocable only** (`disable-model-invocation: true`). Never invoked automatically.
- **No OpenSpec CLI calls from this skill itself.** Delegate to `/opsx:propose`, which knows the artifact-generation conventions.
- **Preserve the original roadmap entry's text verbatim** in the proposal's `## Why`. The roadmap entry has been reviewed and agreed upon; rewording it during promotion creates reviewer-vs-roadmap drift.
- **Link to `design.md §Decision N` references with precise anchors.** OpenSpec's archive step validates that `proposal.md` cross-references resolve; broken links cause archive-time warnings.
- **If the roadmap entry is `[Deferred]`**, prompt the operator to confirm the blocker is now resolved before promoting — deferred items often have explicit prereqs like "requires cluster deploy" or "blocked on upstream release."

## Related

- `.claude/skills/openspec-propose/SKILL.md` — the underlying proposal scaffold skill this one wraps
- `.claude/skills/roadmap-tracker/SKILL.md` — for adding/listing roadmap items; this skill assumes an entry already exists
- `.claude/rules/openspec.md` — OpenSpec 1.2.0 workflow rules (naming conventions, `MODIFIED Requirements` baseline rule)
- `docs/operations/roadmap.md` — canonical roadmap source-of-truth
