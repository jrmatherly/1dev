---
title: Regression Guards
icon: shield
---

# Regression Guards {subtitle="bun:test structural guards under tests/regression/"}

The fork maintains structural regression guards that protect invariants established by Phase 0 hard gates, the brand taxonomy, and the documentation-site capability. Each guard is a single-file `bun:test` test that walks the codebase and fails if a protected invariant is violated.

## Current Inventory (7 guards)

| Guard file | Protects | Motivated by |
|------------|----------|-------------|
| `auth-get-token-deleted.test.ts` | Dead `auth:get-token` IPC handler stays deleted | Phase 0 gates #1-4 |
| `token-leak-logs-removed.test.ts` | No token preview / credential fragments in logs across `src/main/` | Phase 0 gates #5-6 |
| `credential-manager-deleted.test.ts` | Orphan `credential-manager.ts` stays deleted | tscheck remediation R1 |
| `gpg-verification-present.test.ts` | GPG signature verification in Claude binary download script | Phase 0 gate #7 |
| `feature-flags-shape.test.ts` | Feature flag key shape in `FLAG_DEFAULTS` matches spec | Phase 0 gate #12 |
| `brand-sweep-complete.test.ts` | No Tier A (upstream brand) identifiers in runtime code/scripts | rebrand-residual-sweep |
| `no-scratchpad-references.test.ts` | No `.scratchpad/` path references in tracked files | documentation-site capability |

## Adding a New Guard

Use the `new-regression-guard` skill (`.claude/skills/new-regression-guard/SKILL.md`) to scaffold. It mirrors the existing walker pattern and enforces:

- **File-level allowlists** (not line-number) — survives edits within the allowlisted file
- **Every allowlist entry has a comment** explaining why the file is exempt
- **Structured error messages** with count, file:line list, truncated snippet, actionable next step, and a reference to the motivating change
- **Side-effect free**, no network access, runs in <200ms
- **Increment the guard count** in CLAUDE.md and Serena memories after adding

## Running

```bash
bun test                                              # all guards
bun test tests/regression/brand-sweep-complete.test.ts  # single guard
```
