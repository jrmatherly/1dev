---
name: openspec-propose-gate
description: Scaffold a new OpenSpec change proposal from a Phase 0 hard gate in the 1Code enterprise fork. Use when the user asks to "create the OpenSpec proposal for gate #N", "draft the proposal for the next phase 0 gate", or "scaffold gate-N-proposal". Wraps `bunx @fission-ai/openspec@1.2.0 new change` with gate-specific templates pulled from strategy v2.1 §6.
---

# OpenSpec Propose Gate

Create an OpenSpec change proposal that implements exactly one Phase 0 hard gate from `.scratchpad/auth-strategy-envoy-gateway.md` §6. This skill enforces the "gate text is exact scope, not a minimum" rule documented in CLAUDE.md — the proposal must match the gate's scope as written in §6, not an expanded version.

## When to invoke

- User asks to "scaffold an OpenSpec proposal for Gate #N"
- User asks to "create the next Phase 0 OpenSpec change"
- User explicitly invokes `/openspec-propose-gate` with a gate number
- After a prior session has left Gate #N unimplemented and the user wants to pick it up in a fresh session

## Prerequisites the agent must verify

1. `bunx @fission-ai/openspec@1.2.0 --version` returns `1.2.0` (if not, fall back to `openspec` on PATH or ask user)
2. The gate being proposed is NOT already complete per `CLAUDE.md` Phase 0 progress block
3. No conflicting change directory exists at `openspec/changes/<name>/`
4. Working tree is clean (`git status --short` returns empty) — do NOT mix OpenSpec scaffolding with other uncommitted changes

## Procedure

### Step 1 — Read the gate text

Read `.scratchpad/auth-strategy-envoy-gateway.md` §6 using `sed -n` via Bash (the file exceeds the Read tool's 10k-token cap — see CLAUDE.md "claude-mem Read-tool interaction" note):

```bash
grep -n "^### Phase 0 Hard Gate #" .scratchpad/auth-strategy-envoy-gateway.md
```

Then read the specific gate's section. The gate text is the **literal scope** of the proposal — do not expand it with design decisions, architecture sketches, or three-segment models. Those belong in separate proposals if they become needed.

### Step 2 — Pick a change-id

Use kebab-case, verb-led, descriptive:

- Gate #7 (binary checksums): `add-binary-checksum-verification` or `harden-binary-downloader`
- Gate #8 (sandbox OAuth): `remove-upstream-sandbox-oauth` (this specific name was audited and chosen in the 2026-04-08 session)
- Gate #12 (feature flags): `add-feature-flag-infrastructure` (already exists — unarchived)
- Gate #13 (OpenSpec conversion): self-describing, already done

Prefer positive/action framing ("remove", "add", "harden", "replace") over neutral ("refactor"). The naming follows the existing repo style — check `openspec/changes/` for precedent.

### Step 3 — Scaffold the change directory

```bash
bunx @fission-ai/openspec@1.2.0 new change <change-id> \
  --description "Gate #N: <short description from §6>"
```

This creates `openspec/changes/<change-id>/` with placeholder files.

### Step 4 — Fetch the artifact templates

OpenSpec 1.2.0 provides per-artifact instructions:

```bash
bunx @fission-ai/openspec@1.2.0 instructions proposal --change <change-id>
bunx @fission-ai/openspec@1.2.0 instructions specs --change <change-id>
bunx @fission-ai/openspec@1.2.0 instructions tasks --change <change-id>
bunx @fission-ai/openspec@1.2.0 instructions design --change <change-id>  # optional
```

Use the exact template structure each command returns. Do NOT invent your own format — the strict validator rejects `#####` (5 hashtag) scenarios silently, and scenarios without a Requirement parent will also fail.

### Step 5 — Write `proposal.md`

Required sections (from `openspec instructions proposal`):

```markdown
## Why
<1-2 sentences on the gate's purpose, quoting §6 text verbatim>

## What Changes
- **REMOVE** ...
- **ADD** ...
- **MODIFY** ...

## Capabilities
### New Capabilities
- `capability-kebab-name`: <description>

### Modified Capabilities
(none, OR list existing capability whose requirements are changing)

## Impact
Affected files: <list>
Downstream work unblocked: <list future gates/proposals>
```

**Critical**: If the gate adds to an existing capability, check whether that capability's baseline exists at `openspec/specs/<capability>/spec.md`. If not (the capability is still inside an unarchived change), use `## ADDED Requirements` on a **new** capability instead of `## MODIFIED Requirements` on the unarchived one. This is the OpenSpec 1.2.0 baseline constraint documented in CLAUDE.md.

### Step 6 — Write `specs/<capability>/spec.md`

Each Requirement MUST be followed by at least one Scenario with **exactly 4 hashtags**:

```markdown
## ADDED Requirements

### Requirement: <imperative name>
The system SHALL <normative behavior using SHALL or MUST>.

#### Scenario: <scenario name>
- **WHEN** <precondition>
- **THEN** <expected behavior>
- **AND** <additional expectation>

#### Scenario: <second scenario if needed>
- **WHEN** ...
- **THEN** ...
```

For REMOVED Requirements:

```markdown
## REMOVED Requirements

### Requirement: <name being removed>
**Reason**: <why it's being removed>
**Migration**: <what replaces it>
```

### Step 7 — Write `tasks.md`

The apply phase parses `- [ ] N.M Task description` checkboxes. Group by concern, not by file:

```markdown
## 1. Pre-flight / regression guard red

- [ ] 1.1 Write regression guard at tests/regression/<name>.test.ts
- [ ] 1.2 Run `bun test` and verify ASSERTION failure (not compile error)
- [ ] 1.3 Confirm red state before proceeding to green

## 2. Implementation

- [ ] 2.1 ...
- [ ] 2.2 ...

## 3. Verification (four quality gates)

- [ ] 3.1 `bun run ts:check` baseline unchanged
- [ ] 3.2 `bun run build` exits 0
- [ ] 3.3 `bun test` all regression guards green
- [ ] 3.4 `bun audit` clean

## 4. Documentation

- [ ] 4.1 Update CLAUDE.md Phase 0 progress block
- [ ] 4.2 Mark gate complete in strategy doc cross-references
```

### Step 8 — Optional `design.md`

Include a design.md ONLY if the gate has genuine architectural decisions that don't fit in the proposal (<500 words) or the spec (normative text only). Examples: enum shape choices, state machine diagrams, migration strategies. For simple deletion gates, skip design.md entirely.

### Step 9 — Validate

```bash
bunx @fission-ai/openspec@1.2.0 validate <change-id> --strict --no-interactive
```

Must return `Change '<change-id>' is valid` before the user reviews. If validation fails, the error message names the failing assertion — fix and re-run. Common failures:
- Scenario headers with wrong hashtag count (`###` or `#####` instead of `####`)
- Requirement block with no Scenario children
- MODIFIED Requirements referencing a non-existent baseline spec
- Missing `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` header in a delta file

### Step 10 — Hand off to the user for review

After validation passes, show the user:

1. The list of created files (`find openspec/changes/<change-id> -type f`)
2. The validator output
3. The proposal's Capabilities section (so they can confirm scope)
4. A preview of the first 2 tasks from tasks.md

Then ask: "Proposal scaffolded and validates. Ready to implement, or do you want changes first?"

**Do NOT start implementing without explicit approval.**

## Scope discipline (hard rule)

The #1 failure mode this skill prevents is **scope creep**. The gate's text in `auth-strategy-envoy-gateway.md` §6 is the exact scope. If you find yourself wanting to:

- Add a feature flag to the proposal (gate is about deletion)
- Add a new credential store (gate is about env-var refactoring)
- Add cluster-side work (gate is desktop-only)
- Add three-segment architecture (gate is about one segment)

...stop. That's a SEPARATE OpenSpec change. File it as a follow-up proposal name in the current proposal's "Downstream work unblocked" bullet list. Do NOT bundle it into Layer 1.

Violating this rule in the Gate #8 prior session triggered a 4-reviewer audit that found 6 Critical and 6 High findings — all because a deletion-only gate was scope-expanded to include env-var injection, feature flag additions, and a three-segment credential model.

## References

- `.scratchpad/auth-strategy-envoy-gateway.md` — the frozen strategy doc with Phase 0 §6 gate text
- `openspec/changes/add-feature-flag-infrastructure/` — reference for a multi-requirement proposal with complete spec + tasks
- `openspec/changes/retire-mock-api-translator/` — reference for a scoped deletion proposal
- `openspec/config.yaml` — schema config (must be `spec-driven`)
- CLAUDE.md "Environment Notes" — OpenSpec CLI gotchas, baseline constraint, bunx invocation
- CLAUDE.md "Documentation Maintenance" — "Phase 0 gate text is exact scope, not a minimum" rule

## Failure modes this skill prevents

1. **Using `openspec` directly in the Bash tool's non-login shell** (PATH issue) — always use `bunx @fission-ai/openspec@1.2.0`
2. **Using `## MODIFIED Requirements` against an unarchived baseline** — use `## ADDED Requirements` on a new capability instead
3. **Writing `####` scenarios as `###` or `#####`** — silent validator failure
4. **Bundling multiple gates into one proposal** — violates scope discipline, triggers audit rework
5. **Implementing before validation passes** — produces uncommittable code
6. **Implementing before user review** — wastes work if the scope is wrong
