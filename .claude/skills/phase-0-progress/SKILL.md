---
name: phase-0-progress
description: Verify Phase 0 hard-gate status for the enterprise self-hosting migration by checking documentation claims against filesystem evidence (regression guards, CI workflow, Drizzle migrations, OpenSpec proposals, GPG verification). Use when the user asks about Phase 0 progress, before committing changes that touch self-hosting migration, or after completing a gate to confirm the status claim is still accurate. User and Claude invocable.
---

# Phase 0 Progress Verifier

This skill codifies the Phase 0 hard-gate checklist from the 1Code enterprise fork's self-hosting migration strategy (see `docs/enterprise/auth-strategy.md` v2.1). It checks the claims in the canonical Phase 0 status document against actual filesystem evidence and reports any drift.

## Why this exists

The canonical Phase 0 status lives at `docs/enterprise/phase-0-gates.md`. A summary block also appears in `CLAUDE.md` near the top ("Phase 0 progress"). Either surface can drift when gates land without the status being updated. This skill makes the truth computable instead of transcribable.

Historical drift in this repo:
- Gates #7, #12, #13 once landed without updating the status block
- The "remaining gates" list once included items elsewhere marked RESOLVED

## How to run

### Step 1 — Parse the documented claim

The canonical source is `docs/enterprise/phase-0-gates.md`. The CLAUDE.md summary is a short-form mirror.

```bash
# Canonical source (if present):
test -f docs/enterprise/phase-0-gates.md && \
  grep -E "^- (✅|⏳|❌) \*?\*?#[0-9]+" docs/enterprise/phase-0-gates.md

# CLAUDE.md summary (short form):
grep -E "^(- )?(✅|⏳|❌) ?\*?\*?#[0-9]+" CLAUDE.md
```

Expected: one line per gate with its status marker and brief description. Capture the status of each gate #1 through #15.

If the two sources disagree, the canonical `docs/enterprise/phase-0-gates.md` wins and CLAUDE.md is drift.

### Step 2 — Check each gate against filesystem evidence

Use this verification matrix. For each gate, run the check and compare to the documented claim:

#### Gate #1-4 — Dead `auth:get-token` IPC handler deletion

```bash
# Should find NOTHING in main process
grep -rn "auth:get-token" src/main/ src/preload/ 2>/dev/null
# Regression guard should exist
test -f tests/regression/auth-get-token-deleted.test.ts && echo "guard: present" || echo "guard: MISSING"
```

Status is ✅ if: no grep matches AND guard file exists.

#### Gate #5-6 — Token preview log sanitization

```bash
# Regression guard should exist and pass
test -f tests/regression/token-leak-logs-removed.test.ts && echo "guard: present" || echo "guard: MISSING"
# The forbidden patterns should NOT appear anywhere in main process
grep -rn "Token preview:\|tokenPreview:\|Token total length:\|finalCustomConfig\.token\.slice" src/main/ 2>/dev/null
```

Status is ✅ if: guard file exists AND no grep matches.

#### Gate #7 — Binary checksum + GPG verification

```bash
test -f scripts/anthropic-release-pubkey.asc && echo "pubkey: present" || echo "pubkey: MISSING"
grep -l "gpg --verify\|openpgp" scripts/download-claude-binary.mjs && echo "claude GPG: present"
grep -l "sha256\|SHA-256\|createHash" scripts/download-claude-binary.mjs scripts/download-codex-binary.mjs
test -f tests/regression/gpg-verification-present.test.ts && echo "guard: present" || echo "guard: MISSING"
```

Status is ✅ if: pubkey file exists AND GPG verification is referenced in the Claude binary downloader AND SHA-256 verification is referenced in both downloaders AND the regression guard exists.

#### Gate #8 — Upstream sandbox OAuth extraction

```bash
# Should NOT find sandbox_id in claude-code.ts after gate completion
grep -n "sandbox_id\|sandboxId" src/main/lib/trpc/routers/claude-code.ts
# OpenSpec change should be archived
ls openspec/changes/archive/*remove-upstream-sandbox-oauth* 2>/dev/null
```

Status is ✅ if: `sandbox_id`/`sandboxId` is gone from `claude-code.ts` AND the archived OpenSpec change exists.

#### Gate #9 — Minimum CI workflow

```bash
test -f .github/workflows/ci.yml && echo "CI workflow: present" || echo "CI workflow: MISSING"
grep -E "bun run ts:check|bun run build|bun test|bun audit" .github/workflows/ci.yml
```

Status is ✅ if: the file exists AND all four quality gates are invoked.

#### Gate #10 — Dependabot config

```bash
test -f .github/dependabot.yml && echo "dependabot: present" || echo "dependabot: MISSING"
```

Status is ✅ if: the file exists. Note: secret-scanning UI enable is tracked separately as a sub-item — it cannot be verified from the repo.

#### Gate #11 — bun:test framework + regression guards

```bash
ls tests/regression/*.test.ts 2>/dev/null | wc -l
# Should be ≥ 5 guards
bun test 2>&1 | tail -5
```

Status is ✅ if: at least 5 regression guards exist AND `bun test` reports all passing.

#### Gate #12 — Feature flag infrastructure

```bash
# Schema must have the table
grep -n "featureFlagOverrides\|feature_flag_overrides" src/main/lib/db/schema/index.ts
# Migration must exist
ls drizzle/*feature_flag* drizzle/0008_*.sql 2>/dev/null
# Lib module must exist
test -f src/main/lib/feature-flags.ts && echo "lib: present" || echo "lib: MISSING"
# tRPC router must exist and be mounted
test -f src/main/lib/trpc/routers/feature-flags.ts && grep -n "featureFlagsRouter\|featureFlags:" src/main/lib/trpc/routers/index.ts
# Regression guard must exist
test -f tests/regression/feature-flags-shape.test.ts && echo "guard: present" || echo "guard: MISSING"
```

Status is ✅ if: schema has the table, migration file exists, lib module exists, tRPC router exists and is mounted in `createAppRouter`, and the regression guard exists.

#### Gate #13 — OpenSpec 1.2.0 migration

```bash
test -f openspec/config.yaml && echo "config: present" || echo "config: MISSING"
# New 1.2.0 layout has skills under .claude/skills/openspec-*
ls .claude/skills/openspec-* 2>/dev/null | wc -l
# Old 1.x file should be gone
test -f openspec/AGENTS.md && echo "⚠️  old openspec/AGENTS.md still present — migration incomplete" || echo "old file: gone (good)"
```

Status is ✅ if: `openspec/config.yaml` exists AND at least 4 OpenSpec skills exist under `.claude/skills/` AND the old `openspec/AGENTS.md` is gone.

#### Gate #14 — Electron patch

```bash
# Check current pin (after Electron 40 upgrade this will be ^40.x)
grep -E '"electron":\s*"\^?[0-9]+\.[0-9]+\.[0-9]+"' package.json
```

Status is ✅ if: the Electron pin is at or above the version documented in `docs/enterprise/phase-0-gates.md` (currently Electron 40.x after the April 2026 upgrade).

#### Gate #15 — F1-F10 restoration decisions

```bash
test -f docs/enterprise/upstream-features.md && grep -cE "^F[0-9]+ " docs/enterprise/upstream-features.md
# Should find at least 10 F-entries
```

Status is ✅ if: the inventory file exists AND has at least 10 F-entries documented.

### Step 3 — Report

Produce a report with this exact format:

```
## Phase 0 Progress Verification

### Documented claim (docs/enterprise/phase-0-gates.md + CLAUDE.md summary)
- ✅ #1-6 — dead auth:get-token + token log sanitization
- ✅ #7 — binary checksum + GPG
- ✅ #8 — upstream sandbox OAuth removal
- ✅ #9 — CI workflow
- ... (all 15)

Claimed: N of 15 complete

### Filesystem evidence

| Gate | Doc claim | Evidence | Agree? |
|------|-----------|----------|--------|
| #1-4 | ✅ | No IPC handler, guard present | ✅ |
| #5-6 | ✅ | No forbidden strings, guard present | ✅ |
| #7   | ✅ | pubkey + GPG verify + SHA256 + guard | ✅ |
| #8   | ✅ | No sandbox_id in claude-code.ts, change archived | ✅ |
| #9   | ✅ | ci.yml exists, all 4 gates invoked | ✅ |
| #10  | ✅ | dependabot.yml exists | ✅ |
| #11  | ✅ | N guards, all passing | ✅ |
| #12  | ✅ | schema + migration + lib + router + guard | ✅ |
| #13  | ✅ | config.yaml + N skills + no old AGENTS.md | ✅ |
| #14  | ✅ | Electron pinned to expected version | ✅ |
| #15  | ✅ | inventory has 10 F-entries | ✅ |

### Cross-surface consistency

| Surface | Claim | Matches evidence? |
|---------|-------|-------------------|
| `docs/enterprise/phase-0-gates.md` | N/15 | ✅/❌ |
| `CLAUDE.md` summary block | N/15 | ✅/❌ |

### Verdict
CLEAN — both documented surfaces match filesystem state. No drift.

OR

DRIFT DETECTED — Gates N, M have wrong status:
- Gate N: `docs/enterprise/phase-0-gates.md` says ✅ but [evidence shows X]
- Gate M: `CLAUDE.md` says ⏳ but the canonical doc and evidence both show ✅

### If drift: recommended fix
Primary: edit `docs/enterprise/phase-0-gates.md` to correct the gate status.
Mirror: edit `CLAUDE.md` summary block to match.
```

## What NOT to do

- **Do not run `bun run ts:check` or `bun run build` as part of this skill.** Those are quality gates, not Phase 0 gates. They take 45 seconds each and are not what this skill is checking.
- **Do not edit either documentation surface.** Report the drift; let the user decide whether to apply the fix.
- **Do not assume a gate is complete because "it looks like it's been done."** Every gate must have concrete filesystem evidence per the matrix above.
- **Do not treat CLAUDE.md as the canonical source.** The canonical source is `docs/enterprise/phase-0-gates.md`; the CLAUDE.md summary is a short-form mirror that is allowed to be terser but must not contradict the canonical source.

## When to recommend running this skill

- Before any commit that touches: `src/main/lib/db/schema/`, `tests/regression/`, `scripts/download-*-binary.mjs`, `.github/workflows/`, `docs/enterprise/upstream-features.md`, or the CLAUDE.md Phase 0 summary
- Before tagging a release
- After completing what the user believes to be a gate, to verify and update both `docs/enterprise/phase-0-gates.md` and the CLAUDE.md summary in the same commit
- When the user asks "where are we on Phase 0?" or "how many gates are left?"
