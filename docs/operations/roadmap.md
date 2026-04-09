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

### [Deferred] mock-api.ts Phase 3 -- delete remaining F-entry stubs

**Added:** 2026-04-09
**Scope:** After F1-F10 restoration is complete, delete `mock-api.ts` entirely. Currently retained as dead stubs for `teams`, `stripe`, `user`, `github`, `claudeCode`, `agentInvites`, `repositorySandboxes` namespaces that will be replaced by real self-hosted backends during F-entry restoration.
**Effort:** Trivial (delete file)
**Prereqs:** F1-F10 restoration work
**Canonical reference:** `docs/enterprise/upstream-features.md` (F1-F10 catalog)

### [Cleanup] ts:check baseline remediation (80 remaining)

**Added:** 2026-04-09
**Scope:** Reduce the TypeScript error baseline from 86 to 0. Root causes R1 (dead code) and R4 (snake/camelCase) are resolved. Remaining: R2 (upstream sandbox DTO, 16 errors), R3 (teams stub, ~8 errors), R5 (Claude SDK drift, 9 errors), R6 (long-tail, ~52 errors).
**Effort:** Medium (can be done incrementally per root cause)
**Prereqs:** None (each root cause is independent)
**Canonical reference:** [`docs/conventions/tscheck-baseline.md`](../conventions/tscheck-baseline.md)

---

## P3 -- Low Priority / Opportunistic

### [Ready] Electron 40 → 41 upgrade

**Added:** 2026-04-09
**Scope:** Bump Electron from 40.8.5 to 41.2.0 (Chromium 146, Node.js 24.14). No breaking API changes affect codebase. Native modules (better-sqlite3, node-pty) require rebuild. Electron 40 EOL is 2026-06-30; upgrade extends support to 2026-08-25.
**Effort:** Small
**Prereqs:** None
**Canonical reference:** `openspec/changes/upgrade-electron-41/proposal.md`

### [Ready] TypeScript 5 → 6 upgrade

**Added:** 2026-04-09
**Scope:** Upgrade TypeScript from 5.9.3 to 6.0.2 — the "bridge release" before TS 7.0 (Go rewrite). Add `"types": ["node"]` and `"noUncheckedSideEffectImports": false` to tsconfig. Re-baseline error count. Update tsgo alignment.
**Effort:** Small-Medium
**Prereqs:** None
**Canonical reference:** `openspec/changes/upgrade-typescript-6/proposal.md`

### [Ready] Tailwind CSS 3 → 4 + tailwind-merge 2 → 3

**Added:** 2026-04-09
**Scope:** Migrate to Tailwind v4 (Rust engine, CSS-first config). ~1,300+ class renames across 174 files (80% automated by `@tailwindcss/upgrade`). Migrate from PostCSS plugin to `@tailwindcss/vite`. Replace `tailwindcss-animate` with `tw-animate-css`. Fix `agents-styles.css` internal `--tw-ring-*` variable references. Must upgrade tailwind-merge to v3 simultaneously (drops TW3 support).
**Effort:** Medium-Large
**Prereqs:** None (upgrade tool available)
**Canonical reference:** `openspec/changes/upgrade-tailwind-4/proposal.md`

### [Ready] Vite 7 — Phase A (unblocked stepping stone)

**Added:** 2026-04-09
**Scope:** Bump Vite 6→7 + plugin-react 4→5 with electron-vite 5.0.0 (stable). Validates CJS interop and browser target changes. Should land BEFORE Tailwind 4 so `@tailwindcss/vite` is tested against its natural Vite version.
**Effort:** Small-Medium
**Prereqs:** TypeScript 6 should land first (sets `noUncheckedSideEffectImports`)
**Canonical reference:** `openspec/changes/upgrade-vite-8-build-stack/proposal.md` (Phase A tasks)

### [Blocked] Vite 8 — Phase B + Shiki 4

**Added:** 2026-04-09
**Scope:** Vite 8 (Rolldown replaces esbuild+Rollup) + electron-vite 6.0 + plugin-react 6.0 + Shiki 3→4. Critical CJS validation needed: `__dirname`, `require()`, dynamic `import()`, `import.meta.env`. Shiki blocked on `@pierre/diffs` updating both `shiki` and `@shikijs/transformers` to `^4.0.0`.
**Effort:** Medium-Large
**Prereqs:** Tailwind 4 MUST complete first (avoids double-restructuring `electron.vite.config.ts`); Phase B blocked on electron-vite 6.0.0 stable; Shiki blocked on `@pierre/diffs`
**Canonical reference:** `openspec/changes/upgrade-vite-8-build-stack/proposal.md` (Phase B + Shiki tasks)

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

### [Deferred] Prepare for Electron 42 breaking changes

**Added:** 2026-04-09
**Scope:** Electron 42 will change dialog default directories (pass explicit `defaultPath`), migrate macOS notifications to `UNNotification`, and move Electron binary download from `postinstall` to on-demand. Prep work after Electron 41 upgrade lands.
**Effort:** Small
**Prereqs:** `upgrade-electron-41` complete
**Canonical reference:** `openspec/changes/upgrade-electron-41/proposal.md` (Prepare-now section)

### [Cleanup] Dependabot comment refresh

**Added:** 2026-04-09
**Scope:** Update `.github/dependabot.yml` comments and `.claude/skills/verify-pin/SKILL.md` to reflect current pin reasons. Will be largely superseded when the upgrade OpenSpec changes (`upgrade-electron-41`, `upgrade-typescript-6`, `upgrade-tailwind-4`, `upgrade-vite-8-build-stack`) are archived.
**Effort:** Trivial
**Prereqs:** None

---

## Recently Completed

| Date | Item | Change/Commit |
|------|------|---------------|
| 2026-04-09 | login.html brand refresh (21ST to 1Code logo) | `7c8d884` |
| 2026-04-09 | Electron 39.8.7 to 40.8.5 upgrade | `upgrade-electron-40` archived |
| 2026-04-09 | mock-api.ts Phase 1 timestamp fossil retirement | `retire-mock-api-translator` archived |
| 2026-04-09 | mock-api.ts Phase 2 consumer migration (6 files, 13 useUtils sites, message-parser.ts helper, TS baseline 86→80) | `migrate-mock-api-consumers` archived |
| 2026-04-09 | Enterprise auth module (MSAL Node) | `add-enterprise-auth-module` archived |
| 2026-04-09 | Credential storage hardening (3-tier) | `harden-credential-storage` archived |
| 2026-04-09 | Dev auth bypass (`MAIN_VITE_DEV_BYPASS_AUTH`) | `10be3d7` |
| 2026-04-09 | Enterprise auth wiring (Strangler Fig adapter) | `wire-enterprise-auth` (ready to archive) |
| 2026-04-08 | Phase 0 hard gates 15/15 complete | `docs/enterprise/phase-0-gates.md` |
