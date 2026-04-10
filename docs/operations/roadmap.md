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

### [Ready] SLSA provenance attestation for release artifacts

**Added:** 2026-04-10
**Scope:** Add `permissions: id-token: write` to the release job in `release.yml` and call `actions/attest@v2` (or `actions/attest-build-provenance@v4`) after downloading artifacts, before `softprops/action-gh-release`. This gives users `gh attestation verify` against published installers — a cryptographic chain from GitHub OIDC to the binary, compensating for unsigned builds. Zero secrets required, ~10 lines of YAML. Identified by the 5-reviewer parallel audit (Security finding ME-002, Ecosystem Gap 1).
**Effort:** Small (30 min)
**Prereqs:** First release build succeeds (`v0.0.73`)
**Canonical reference:** [`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance), Security review finding ME-002

### [Ready] Archive `upgrade-electron-41` OpenSpec change

**Added:** 2026-04-10
**Scope:** Run `/opsx:archive upgrade-electron-41` to sync the `electron-runtime` delta spec to the baseline and move the change to `openspec/changes/archive/`. 26/27 tasks complete; Task 5.3 (auto-updater end-to-end) is moot now that the update pipeline itself was rebuilt with the GitHub provider migration. The archive will promote the `MODIFIED` spec requirements to the `electron-runtime` baseline under `openspec/specs/`.
**Effort:** Trivial (10 min)
**Prereqs:** None
**Canonical reference:** `openspec/changes/upgrade-electron-41/`, `.claude/rules/openspec.md`

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

### [Research] Re-evaluate Shiki 4 upgrade tractability

**Added:** 2026-04-09
**Scope:** PR #11 (shiki 3.23.0 → 4.0.2) now passes **all 5 CI quality gates** on main after CI workflow fixes (run `24224043794`, 2026-04-10). Previous blocker assumption was `@pierre/diffs` pinning `shiki: ^3.0.0` AND `@shikijs/transformers: ^3.0.0`, which would create an unresolvable peer-dep conflict. CI passing suggests either (a) `@pierre/diffs` has relaxed its peer-dep range, (b) bun's resolver is handling the dual-version scenario gracefully, or (c) the peer-dep conflict is non-fatal at build time. Investigate: run `bun info @pierre/diffs peerDependencies`, check if shiki 3 and 4 both ship in `node_modules`, dev-test syntax highlighting in the renderer to verify no runtime breakage. May be mergeable standalone, separating it from the Vite 8 + electron-vite 6 Phase B work.
**Effort:** Small (2-4h investigation + merge decision)
**Prereqs:** None
**Canonical reference:** PR #11, CI run 24224043794

### [Ready] Code-sign release builds

**Added:** 2026-04-10
**Scope:** The `.github/workflows/release.yml` first iteration ships **unsigned** installers with `CSC_IDENTITY_AUTO_DISCOVERY: "false"` explicitly set. Users see Gatekeeper (macOS) / SmartScreen (Windows) warnings. To enable signing: (1) provision Apple Developer ID certificate, export as `.p12`, base64-encode, set as `CSC_LINK` + `CSC_KEY_PASSWORD` repo secrets; (2) set `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID` for notarization; (3) acquire a Windows EV (or OV) cert, set as `WINDOWS_CSC_LINK` + `WINDOWS_CSC_KEY_PASSWORD`; (4) remove the `CSC_IDENTITY_AUTO_DISCOVERY: "false"` override from release.yml; (5) add `notarize: true` or equivalent to the macOS leg. `gh secret list` currently shows zero secrets — all signing infrastructure is greenfield.
**Effort:** Medium (1-2d cert procurement + 1d workflow hardening)
**Prereqs:** Apple Developer Program membership, Windows code-signing cert provisioned
**Canonical reference:** `docs/operations/release.md` "Code Signing (Not Yet Enabled)" section

### [Ready] K8s manifest CI — validation workflow (Phase 1)

**Added:** 2026-04-10 (rescoped — Phase 2 container build now complete)
**Scope:** Manifest validation CI — `deploy-validate.yml` workflow triggered on PRs touching `deploy/`. Tools: `kubeconform` (schema), `kustomize build` (render), optional Kyverno policy checks.
**Effort:** Small
**Prereqs:** None
**Canonical reference:** `deploy/README.md`

### [Deferred] K8s OCI artifact packaging (Phase 3)

**Added:** 2026-04-10
**Scope:** `flux push artifact` to publish manifests as OCI artifacts for air-gapped/immutable delivery. Post-GA optimization.
**Effort:** Medium
**Prereqs:** Phase 2 container build complete (done)
**Canonical reference:** `deploy/README.md`

---

## P3 -- Low Priority / Opportunistic

### [Blocked] Vite 8 — Phase B + Shiki 4

**Added:** 2026-04-09
**Scope:** Vite 8 (Rolldown replaces esbuild+Rollup) + electron-vite 6.0 + plugin-react 6.0 + Shiki 3→4. Critical CJS validation needed: `__dirname`, `require()`, dynamic `import()`, `import.meta.env`. Shiki blocked on `@pierre/diffs` updating both `shiki` and `@shikijs/transformers` to `^4.0.0`.
**Effort:** Medium-Large
**Prereqs:** Tailwind 4 completed + archived 2026-04-10; Phase B blocked on electron-vite 6.0.0 stable; Shiki blocked on `@pierre/diffs` (PR #11 CI passing — may be mergeable standalone, see `[Research] Re-evaluate Shiki 4` entry)
**Canonical reference:** `openspec/changes/upgrade-vite-8-build-stack/proposal.md` (Phase B + Shiki tasks)

### [Ready] Dependency caching for release workflow

**Added:** 2026-04-10
**Scope:** Add `actions/cache@v4` to `.github/workflows/release.yml` matrix-build job: cache `~/.bun/install/cache` keyed on `${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}`, and optionally cache the Electron download at `~/Library/Caches/electron` / `~/.cache/electron` / `%LOCALAPPDATA%\electron\Cache`. Saves 3-5 min per matrix leg, reduces macOS runner billing (10x Linux rate). Identified by CI/CD reviewer (Operational Concern #1) and Ecosystem reviewer (Gap 2).
**Effort:** Small (15 min)
**Prereqs:** First release build succeeds (`v0.0.73`)
**Canonical reference:** CI/CD review finding, [GitHub dependency caching docs](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)

### [Deferred] Beta channel support for auto-updater

**Added:** 2026-04-10
**Scope:** The beta channel code path was removed from `auto-updater.ts` in commit `09c8e5a` because it was architecturally broken: `electron-builder` doesn't emit `beta-mac.yml` without `generateUpdatesFilesForAllChannels: true` in `package.json > build`, and `electron-updater`'s GitHub provider `/releases/latest` endpoint skips prereleases. To restore: (1) add `generateUpdatesFilesForAllChannels: true` to `build` config, (2) set `autoUpdater.allowPrerelease = true` when `channel === "beta"`, (3) re-add `update:set-channel` / `update:get-channel` IPC handlers + channel preference file, (4) add a UI toggle in settings, (5) tag beta releases as `v0.0.XX-beta.N`. See [electron-builder channels tutorial](https://www.electron.build/tutorials/release-using-channels).
**Effort:** Medium (1-2 days — code + UI + testing)
**Prereqs:** Code-sign release builds (beta users especially need trust signals)
**Canonical reference:** Architecture review finding C1, `src/main/lib/auto-updater.ts` top-of-file comment

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
**Scope:** Three prep items unlocked now that Electron 41 is landed:
1. **Dialog default directory** — Electron 42 changes `showOpenDialog` to default to Downloads. 3 call sites need explicit `defaultPath`: `src/main/lib/trpc/routers/projects.ts:64`, `:379`, `:501`.
2. **macOS notifications → `UNNotification`** — Codebase uses the legacy Notification API at `src/main/windows/main.ts:131-162` including a `notification.on("click")` handler. App is already code-signed; verify `UNNotification` behavioral compatibility.
3. **Electron binary download** — Moves from `postinstall` to on-demand. May affect CI cache strategy and `bun install` timing.
**Effort:** Small
**Prereqs:** `upgrade-electron-41` complete (✅ landed 2026-04-09)
**Canonical reference:** `openspec/changes/upgrade-electron-41/proposal.md` (Prepare-now section)

### [Research] Eliminate `gray-matter` eval warning

**Added:** 2026-04-09
**Scope:** The electron-vite build emits a Rollup warning for `node_modules/gray-matter/lib/engines.js (43:13): Use of eval ... is strongly discouraged as it poses security risks`. `gray-matter@4.0.3` is used in 4 main-process files for parsing YAML frontmatter from Claude Code commands, agents, skills, and plugins: `src/main/lib/trpc/routers/commands.ts` (3 sites), `agent-utils.ts`, `skills.ts`, `plugins.ts` (3 sites). All call sites use the default `matter(content)` form with only YAML frontmatter. Options to research before acting:
1. **Restrict to YAML engine only** via `matter(content, { engines: { yaml: ... } })` — least invasive, may not silence Rollup warning since the eval code path still exists in the bundled source
2. **Replace with `front-matter`** (jxson, zero deps, YAML-only, no eval) — drop-in-ish, API differs (`{ attributes, body }` vs `{ data, content }`)
3. **Replace with `vfile-matter`** (unified ecosystem, YAML-only)
4. **Fork/patch `gray-matter`** — last resort, creates maintenance burden

Research must establish: exact usage at each call site (are any relying on non-YAML engines?), whether Option 1 actually silences the warning (spike), transitive dep reduction (`js-yaml`, `kind-of`, `section-matter`, `strip-bom-string`, `argparse`, `sprintf-js`, `esprima` all drop out under Options 2/3), and whether any frontmatter files use YAML features the replacement doesn't support (anchors, tags, multi-doc).
**Effort:** Small-Medium (1-2h research + 1h migration)
**Prereqs:** None
**Canonical reference:** Rollup warning in `bun run build` output; gray-matter source at `node_modules/gray-matter/lib/engines.js:43`

### [Cleanup] Dependabot comment refresh

**Added:** 2026-04-09
**Scope:** Update `.github/dependabot.yml` comments and `.claude/skills/verify-pin/SKILL.md` to reflect current pin reasons. Partially superseded (`upgrade-typescript-6` archived 2026-04-10, `upgrade-electron-41` ready to archive, `upgrade-tailwind-4` archived 2026-04-10); `upgrade-vite-8-build-stack` still active (Phase B blocked).
**Effort:** Trivial
**Prereqs:** None

---

## Recently Completed

| Date | Item | Change/Commit |
|------|------|---------------|
| 2026-04-10 | Self-hosted 1code-api backend service — Phase 1 endpoints (health, changelog, plan, profile), Dockerfile, container-build.yml workflow, 1code-update-server deleted, 17 tests | `implement-1code-api` OpenSpec change |
| 2026-04-10 | First successful all-platform release build (v0.0.79) — 7 iterations (v0.0.73–v0.0.79). Fixes: macOS OOM (NODE_OPTIONS=6144MB), Windows GPG (toGpgPath MSYS conversion in download-claude-binary.mjs), Codex 403 (per-platform downloads + retry), partial releases (if: !cancelled()), Chocolatey GPG hangs (removed), timeout 45→60 min, version consistency check, manifest verification | `release.yml`, `scripts/download-claude-binary.mjs` |
| 2026-04-10 | Tailwind CSS 3.4.19 → 4.2.2 + tailwind-merge 2.6.1 → 3.5.0 — CSS-first config, PostCSS → `@tailwindcss/vite`, `tw-animate-css`, `--tw-ring-*` rewritten to `box-shadow`, 7 false renames fixed (5 initial + 2 caught by code review), 148 files touched by upgrade tool, 10/10 visual QA verified | `upgrade-tailwind-4` archived |
| 2026-04-10 | Release pipeline — 3-OS matrix release.yml + package.json publish → github provider + CDN_BASE removed from auto-updater.ts + runbook rewrite | F5 auto-update channel resolved (unsigned first iteration) |
| 2026-04-10 | Vite 6.4.2 → 7.3.2 + @vitejs/plugin-react 4.7 → 5.2 (Phase A) — CJS interop + `import.meta.env` + React dedup verified in build; functional verification via full streaming Claude agent session | `upgrade-vite-8-build-stack` Phase A (15/59 tasks, stays active for Phase B) |
| 2026-04-10 | TypeScript 5.9.3 → 6.0.2 upgrade (tsconfig `types[]` explicit, `noUncheckedSideEffectImports: false`, tsgo 7.0.0-dev; baseline unchanged at 80) | `upgrade-typescript-6` archived |
| 2026-04-09 | Electron 40 → 41 upgrade (Chromium 146, Node.js 24.14, V8 14.6) | `upgrade-electron-41` committed + pushed (auto-updater pending packaged-build smoke test) |
| 2026-04-09 | Analytics dual-import warning fix | static `setOptOut` import in `windows/main.ts:16` |
| 2026-04-09 | login.html brand refresh (21ST to 1Code logo) | `7c8d884` |
| 2026-04-09 | Electron 39.8.7 to 40.8.5 upgrade | `upgrade-electron-40` archived |
| 2026-04-09 | mock-api.ts Phase 1 timestamp fossil retirement | `retire-mock-api-translator` archived |
| 2026-04-09 | mock-api.ts Phase 2 consumer migration (6 files, 13 useUtils sites, message-parser.ts helper, TS baseline 86→80) | `migrate-mock-api-consumers` archived |
| 2026-04-09 | Enterprise auth module (MSAL Node) | `add-enterprise-auth-module` archived |
| 2026-04-09 | Credential storage hardening (3-tier) | `harden-credential-storage` archived |
| 2026-04-09 | Dev auth bypass (`MAIN_VITE_DEV_BYPASS_AUTH`) | `10be3d7` |
| 2026-04-09 | Enterprise auth wiring (Strangler Fig adapter) | `wire-enterprise-auth` (ready to archive) |
| 2026-04-08 | Phase 0 hard gates 15/15 complete | `docs/enterprise/phase-0-gates.md` |
