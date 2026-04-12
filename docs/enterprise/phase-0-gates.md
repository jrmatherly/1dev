---
title: Phase 0 Hard Gates
icon: list-checks
---

# Phase 0 Hard Gates {subtitle="15 of 15 complete as of 2026-04-12"}

Phase 0 is the prerequisite work that must close before the enterprise fork can ship standalone. Each gate has exact scope defined in the [auth strategy](./auth-strategy.md) and must not be expanded within a single gate.

## Gate Status

| # | Gate | Status | Regression guard |
|---|------|--------|-----------------|
| 1-4 | `auth:get-token` IPC handler deletion | Done | `auth-get-token-deleted.test.ts` |
| 5-6 | Token preview log sanitization | Done | `token-leak-logs-removed.test.ts` |
| 7 | Claude binary SHA-256 + GPG, Codex SHA-256 | Done | `gpg-verification-present.test.ts` |
| **8** | **Upstream sandbox OAuth extraction from `claude-code.ts`** | **Done** | Resolved — OAuth flow removed from `claude-code.ts`, `sandbox_id` is F9 live-preview (dead UI on desktop). See CLAUDE.md Phase 0 gate #8 note. |
| 9 | Minimum CI workflow (`.github/workflows/ci.yml`) | Done | — |
| 10 | Dependabot config | Done | — |
| 11 | `bun:test` framework + regression guards | Done | — |
| 12 | Feature flag infrastructure (Drizzle + tRPC + lib) | Done | `feature-flags-shape.test.ts` |
| 13 | OpenSpec 1.2.0 migration | Done | — |
| 14 | Electron 39.8.6 to 39.8.7 patch | Done | — |
| 15 | F1-F10 restoration decisions | Done | — |

## Gate #8 — The Active Blocker

The only remaining gate. Current implementation at `src/main/lib/trpc/routers/claude-code.ts:178-220` uses an upstream sandbox as the OAuth redirect host. Must be replaced with a localhost-loopback redirect like `auth-manager.ts` already uses.

Tracked by OpenSpec change `remove-upstream-sandbox-oauth` (0/73 tasks).

## Scope Rule

**Phase 0 gate text is exact scope, not a minimum.** If a gate's implementation reveals additional work (new auth mechanism, new credential store, three-segment model), that additional work needs its own OpenSpec change proposal, not a bigger layer within the gate. This rule is load-bearing — violating it triggered the 4-reviewer Gate #8 audit rework.

## Verification

Use the `phase-0-progress` skill to verify gate status against filesystem evidence:
```
/phase-0-progress
```
