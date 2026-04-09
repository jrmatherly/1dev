---
title: Roadmap & Outstanding Work
icon: map
---

# Roadmap {subtitle="Centralized tracker for outstanding work, deferred items, and follow-up recommendations"}

This is the **single source of truth** for all outstanding work items, gaps, and recommendations. Any time work is deferred, it belongs here. Do not track deferred work in commit messages, code comments, CLAUDE.md, or scattered doc sections.

## How to use this page

- **Starting a session?** Read this page first to understand what's queued and what's blocked.
- **Deferring work?** Add an entry here with the date, description, reason, and next action.
- **Completing work?** Move the entry to the "Recently Completed" section at the bottom.
- **Too large to describe inline?** Link to the OpenSpec change, ADR, or canonical doc page.

A `.claude/rules/roadmap.md` rule reminds every session to check this page.
A `.claude/skills/roadmap-tracker/SKILL.md` skill provides `/roadmap` operations (list, add, complete).

## Status legend

| Icon | Meaning |
|------|---------|
| **Blocked** | Waiting on external dependency or decision |
| **Ready** | Scoped and ready to implement as an OpenSpec change |
| **In Progress** | Actively being worked on (note which agent/session) |
| **Deferred** | Intentionally paused with documented reason |
| **Cleanup** | Technical debt / quality improvement (no deadline) |

---

## P1 -- High Priority

### [Ready] F2 -- Automations & Inbox restoration

**Added:** 2026-04-09
**Scope:** Self-host the automations backend. Reverse-engineer the upstream `automations.*`, `github.*`, `linear.*` tRPC contracts and re-implement behind Envoy Gateway. Webhook receivers feed an execution queue that runs agents.
**Effort:** Large (multi-session)
**Prereqs:** Envoy Gateway deployment, F1 OAuth extraction (done)
**Canonical reference:** [`docs/enterprise/upstream-features.md`](../enterprise/upstream-features.md) section F2

### [Ready] F4 -- Voice transcription (local Whisper)

**Added:** 2026-04-09
**Scope:** Replace the upstream Whisper proxy with a local subprocess. The `voice.ts` router already calls OpenAI's API -- redirect to a local Whisper binary or a self-hosted endpoint behind the gateway.
**Effort:** Medium
**Prereqs:** None (can be done independently)
**Canonical reference:** [`docs/enterprise/upstream-features.md`](../enterprise/upstream-features.md) section F4

### [Ready] F8 -- Subscription tier gating via feature flags

**Added:** 2026-04-09
**Scope:** Wire the existing `feature-flags.ts` infrastructure to gate premium features (multi-account, advanced models). The feature flag table and API already exist -- this is the policy layer on top.
**Effort:** Small
**Prereqs:** None (infrastructure already in place via `openspec/specs/feature-flags/spec.md`)
**Canonical reference:** [`docs/enterprise/upstream-features.md`](../enterprise/upstream-features.md) section F8

---

## P2 -- Medium Priority

### [Ready] mock-api.ts Phase 2 -- consumer migration

**Added:** 2026-04-09
**Scope:** Port 6 consumer files from `api.agents.*` (mock-api facade) to `trpc.chats.*` direct. Extract `normalizeCodexToolPart` and JSON message-parsing into typed helpers. This is the follow-up to the `retire-mock-api-translator` Phase 1 change (archived 2026-04-09).
**Effort:** Medium-Large
**Prereqs:** Phase 1 complete (done)
**Canonical reference:** `openspec/changes/archive/2026-04-09-retire-mock-api-translator/proposal.md` section 10

### [Cleanup] ts:check baseline remediation (86 remaining)

**Added:** 2026-04-09
**Scope:** Reduce the TypeScript error baseline from 86 to 0. Root causes R1 (dead code) and R4 (snake/camelCase) are resolved. Remaining: R2 (upstream sandbox DTO, 16 errors), R3 (teams stub, ~8 errors), R5 (Claude SDK drift, 9 errors), R6 (long-tail, ~52 errors).
**Effort:** Medium (can be done incrementally per root cause)
**Prereqs:** None (each root cause is independent)
**Canonical reference:** [`docs/conventions/tscheck-baseline.md`](../conventions/tscheck-baseline.md)

---

## P3 -- Low Priority / Opportunistic

### [Ready] Vite 6 to 7 upgrade

**Added:** 2026-04-09
**Scope:** Now unblocked by electron-vite 5.0.0 (which supports Vite 5/6/7). Assess Tailwind 3.x and shiki 3.x compatibility before upgrading.
**Effort:** Medium
**Prereqs:** Electron 40 upgrade (done)

### [Ready] Electron Fuses enablement

**Added:** 2026-04-09
**Scope:** Enable Electron Fuses (RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments) during packaging to harden the production build. Tracked as Phase 4 F-H1 in `docs/enterprise/auth-fallback.md`.
**Effort:** Small
**Prereqs:** Electron 40 upgrade (done)

### [Ready] shell:open-external URL scheme validation

**Added:** 2026-04-09
**Scope:** Add URL scheme allowlist to the `shell:open-external` IPC handler in `src/main/windows/main.ts`. Currently passes any renderer-provided URL to `shell.openExternal()` without validation.
**Effort:** Trivial
**Prereqs:** None

### [Ready] Dependabot comment refresh

**Added:** 2026-04-09
**Scope:** Update `.github/dependabot.yml` comments and `.claude/skills/verify-pin/SKILL.md` to reflect that electron-vite 5.x removes the `splitVendorChunk` constraint. The Vite pin reason changed from "electron-vite 3.x depends on splitVendorChunk" to "Tailwind 3.x and shiki 3.x compatibility".
**Effort:** Trivial
**Prereqs:** None

---

## Recently Completed

| Date | Item | Change/Commit |
|------|------|---------------|
| 2026-04-09 | login.html brand refresh (21ST to 1Code logo) | `7c8d884` |
| 2026-04-09 | Electron 39.8.7 to 40.8.5 upgrade | `upgrade-electron-40` archived |
| 2026-04-09 | mock-api.ts Phase 1 timestamp fossil retirement | `retire-mock-api-translator` archived |
| 2026-04-09 | Enterprise auth module (MSAL Node) | `add-enterprise-auth-module` archived |
| 2026-04-09 | Credential storage hardening (3-tier) | `harden-credential-storage` archived |
| 2026-04-09 | Dev auth bypass (`MAIN_VITE_DEV_BYPASS_AUTH`) | `10be3d7` |
| 2026-04-08 | Phase 0 hard gates 15/15 complete | `docs/enterprise/phase-0-gates.md` |
