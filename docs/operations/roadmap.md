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

### [Deferred] Auto-updater packaged-build end-to-end verification

**Added:** 2026-04-11 (carved out of `upgrade-electron-41` task 5.3 when the parent change was archived)
**Scope:** Verify the full `electron-updater` round trip on a real packaged installer: (1) build and install version N on a developer machine (`bun run package:mac` / `package:win` / `package:linux`), (2) publish a newer version N+1 to GitHub Releases via `release.yml`, (3) launch version N, observe electron-updater's poll → download → install flow succeeds, (4) confirm the relaunched app is on N+1. This is the only task from `upgrade-electron-41` that could not be verified at archive time because it requires a throwaway release AND a persistent older-version install to upgrade FROM — both cross-cutting concerns that don't belong inside a runtime version bump.
**Why it's deferred:** Unsigned installers are blocked by Gatekeeper (macOS) and SmartScreen (Windows) at the install step. The download path fires fine, but the OS refuses the handoff to the installer binary for unsigned artifacts. Testing against an unsigned build would only validate the download path, not the install path — which is where real users hit failure. Proper verification requires code-signing to be in place first.
**Effort:** Small (~1d after signing lands — package, install, release, observe)
**Prereqs:** `[Ready] Code-sign release builds` (entry below) must land first — signing is a hard blocker for the install-path verification.
**Canonical reference:** `openspec/changes/archive/2026-04-11-upgrade-electron-41/tasks.md` task 5.3 for the deferral context. `docs/operations/release.md` "Code Signing (Not Yet Enabled)" section for the signing blocker. `src/main/auto-updater.ts` for the current electron-updater wiring (GitHub provider, published 2026-04-10).

### [Deferred] mock-api.ts Phase 3 -- delete remaining F-entry stubs

**Added:** 2026-04-09
**Scope:** After F1-F10 restoration is complete, delete `mock-api.ts` entirely. Currently retained as dead stubs for `teams`, `stripe`, `user`, `github`, `claudeCode`, `agentInvites`, `repositorySandboxes` namespaces that will be replaced by real self-hosted backends during F-entry restoration.
**Effort:** Trivial (delete file)
**Prereqs:** F1-F10 restoration work
**Canonical reference:** `docs/enterprise/upstream-features.md` (F1-F10 catalog)

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

### [Blocked] Vite 8 — Phase B

**Added:** 2026-04-09
**Scope:** Vite 8 (Rolldown replaces esbuild+Rollup) + electron-vite 6.0 + plugin-react 6.0. Critical CJS validation needed: `__dirname`, `require()`, dynamic `import()`, `import.meta.env`.
**Effort:** Medium-Large
**Prereqs:** Tailwind 4 completed + archived 2026-04-10; Phase B blocked on electron-vite 6.0.0 stable release
**Canonical reference:** `openspec/changes/upgrade-vite-8-build-stack/proposal.md` (Phase B)

> **2026-04-10:** Shiki 3→4 was previously bundled into this item but has been completed separately via `upgrade-shiki-4` (merged as PR #11). See the Recently Completed table below.

### [Blocked] Collapse shiki dual-version install

**Added:** 2026-04-10
**Scope:** The successful `upgrade-shiki-4` change (PR #11) installed `shiki@4.0.2` at top-level while accepting a nested `shiki@3.23.0` under `@pierre/diffs/node_modules/`. This dual-version install adds ~16 MB to `node_modules` on disk. When `@pierre/diffs` publishes a version that declares `shiki: ^4.0.0` in its dependencies, the nested copy can be eliminated, collapsing to a single shiki 4.x tree. Action: file an issue on `@pierre/diffs` GitHub asking for shiki 4 support, then upgrade `@pierre/diffs` once released.
**Effort:** Small (monitor upstream + 1-line version bump once unblocked)
**Prereqs:** `@pierre/diffs` publishes a shiki-4-compatible release
**Canonical reference:** `openspec/specs/shiki-highlighter/spec.md` §"Dual-version coexistence" requirement, PR #11

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
**Scope:** Update `.github/dependabot.yml` comments and `.claude/skills/verify-pin/SKILL.md` to reflect current pin reasons. Partially superseded (`upgrade-typescript-6` archived 2026-04-10, `upgrade-electron-41` archived 2026-04-11, `upgrade-tailwind-4` archived 2026-04-10); `upgrade-vite-8-build-stack` still active (Phase B blocked).
**Effort:** Trivial
**Prereqs:** None

---

## Recently Completed

| Date | Item | Change/Commit |
|------|------|---------------|
| 2026-04-11 | ts:check baseline **32 → 0** — full 10-bucket sweep from `.scratchpad/code-problems/002-analysis.md`. Bucket A (desktop routing stub arity), B (`"plugin"` source union widening in `FileMentionOption` + `AgentData`), C (unified `AgentDiffView`/`DiffSidebarContentProps`/`DiffSidebarRendererProps` on flat `repository?: string` + nullable `sandboxId` + nullable `agentChat.prUrl` — previously declared `{ owner, name }` structured shape that no consumer ever read as an object), D (widened `CodexMcpServerForSettings` with optional `serverInfo?`/`error?` to align with Claude `MCPServer` shape), E (`isRemote` discriminated-union narrowing via `"in"` check), F (`UploadedFile.mediaType` addition + `?? undefined` narrowing for `agentName`/`desktopUser.name`), G (`app.dock?.setMenu` platform guard + React-19 `useRef` initial value + runtime sandbox guard in `work-mode-selector` + **deleted obsolete `Selection.getComposedRanges` polyfill** now in `lib.dom.d.ts`), H (4 implicit-any lambdas including typing `setDiffStats` useCallback as `DiffStats \| ((prev) => DiffStats)` — fixed the root cause instead of patching individual callsites), I (removed stale `@ts-expect-error`), J (`mcp-servers-indicator` tRPC status cast to `MCPServerStatus` — IDE-only ergonomics, tsgo didn't flag). CI gate now fails on ANY new TS error. See `.claude/.tscheck-baseline` = `0`. | commit `e1efae2` |
| 2026-04-11 | 1code-api LiteLLM provisioning — 77/77 tasks, archived. Replicates the Apollos portal's LiteLLM provisioning subset (user + team + API key lifecycle) inside `services/1code-api`, gated by `PROVISIONING_ENABLED` feature flag. Two-phase read-then-write transaction (Decision 8), five-state key status (Decision 9), single-replica enforcement with regression guard (Decision 10), per-OID rate limit keyGenerator, mass-deprovisioning threshold abort. Full unit + service + route test coverage (103 pass) plus docker-compose integration test harness (10 pass against real Postgres + real LiteLLM `ghcr.io/berriai/litellm:v1.82.3-stable.patch.2`, exposed 1 critical bug: `getProvisionStatus` Drizzle select aliased `teams` as camelCase instead of snake_case — fixed). Cluster side landed in `talos-ai-cluster@500dec69` with `PROVISIONING_ENABLED=false` smoke test green. **Baselines updated:** NEW capability spec `1code-api-litellm-provisioning` (19 requirements); `self-hosted-api` modified (+4 new / 1 modified, now 11 requirements). Followups NOT blocking archive: (1) cluster template cleanup of dead `DEPROVISIONING_CRON_SCHEDULE` / `ROTATION_CRON_SCHEDULE` env vars (scheduler.ts hardcodes them), (2) `MIGRATION_COMPLETE` env var gate needs code implementation before any `PROVISIONING_ENABLED=true` flag flip at the Apollos decommission cutover (decommission-runbook Phase C.2). | `add-1code-api-litellm-provisioning` archived, commits `4d0d80d`, `a938a58`, `ae62ada`, `cf15d81`, `3062c3f`, `97f5e50`, `c79c30d`, `837b129` |
| 2026-04-11 | `upgrade-electron-41` archived at 26/27 tasks. Electron 40.8.5 → 41.2.0 runtime upgrade fully validated (Chromium 146, Node.js 24.14, V8 14.6, native module ABI rebuild, safeStorage invariance, build toolchain compatibility). Task 5.3 (auto-updater packaged-build end-to-end verification) was deferred to the roadmap — the verification requires code-signing to be in place first because unsigned installers are blocked by Gatekeeper/SmartScreen at the install step. Delta spec originally used `## MODIFIED Requirements` with header names that didn't match the baseline; rewrote as `## REMOVED` (old vague "actively maintained" requirement) + `## ADDED` (four precise pins). **Baselines updated:** `electron-runtime` +4 added / -1 removed, now 4 requirements (was 1). | `upgrade-electron-41` archived, commit `d85b935` |
| 2026-04-11 | Secret audit + scrub of tracked files. Scanned all 890 tracked files for true secrets (client secrets, DB passwords, API signing keys, PATs, private keys, AWS keys) — **zero hits** (already clean). Also scanned for semi-sensitive environment identifiers (Entra tenant ID, public/confidential client IDs, Apollos client ID): found 7 files, scrubbed 4 archived OpenSpec files where the literals were not operationally load-bearing, retained 3 live operator docs (`cluster-facts.md`, `envoy-smoke-test.md`, `apollos-decommission-runbook.md`) with explicit "Secret-audit retention policy (2026-04-11)" callouts documenting why each identifier stays. Policy established: if it's a true secret, scrub immediately; if it's a semi-public operator-facing identifier in a live runbook, document the retention with an in-place callout citing `cluster-facts.md` as the canonical rationale. | commit `1d3fbbc` |
| 2026-04-10 | Shiki 3.23.0 → 4.0.2 (standalone) — split out from `upgrade-vite-8-build-stack` Phase B after investigation corrected the "peer-dep blocker" assumption (`@pierre/diffs` declares shiki as regular `dependency`, not `peerDependency`, so Bun installs a nested duplicate `shiki@3.23.0` under `@pierre/diffs/node_modules/` while top-level advances to `4.0.2`). Dual-version coexistence verified empirically (`node_modules` inspection + `bun.lock` diff + runtime verification). All 6 quality gates passing (5 CI-enforced + 1 local lint), renderer built and runtime-tested: chat code highlighting, custom diff highlighter (`codeToHast`), `@pierre/diffs` PatchDiff (nested shiki 3), and theme switching all confirmed working. Also includes: test harness fix (raised `no-scratchpad-references.test.ts` timeout to 15s — pre-existing flake) + Codex downloader rewrite to skip `api.github.com` (hitchhiker commit from PR branch). | `upgrade-shiki-4` (to archive), PR #11 merge `6136048` |
| 2026-04-10 | v0.0.81 patch release — supersedes failed v0.0.80 iteration. TS baseline **54→32** (Cluster A `DiffStateContextValue`, Cluster C `reposData` stub, sidebar dead-code sweep killing 27 SonarLint findings, 4-file targeted fixes, SettingsTab/McpServerStatus literal-union narrowing), keytar arm64 rebuild postinstall fix (dlopen crash on Apple Silicon, extracted to `scripts/rebuild-native-modules.mjs`), Windows `electron-rebuild` resolution via `require.resolve` (not `.bin/` symlink — bun creates shims after postinstall on Windows), Codex downloader rewritten to skip `api.github.com` entirely (pinned SHA256 hashes + direct release-asset URLs → immune to unauth rate-limit 403s that broke v0.0.80/v0.0.81 macOS builds), Shiki 3.x → 4.0.2. v0.0.80 was deleted after partial-build failures. Ships unsigned. | `46f49a4`, `6dece61`, `f779803`, `5295df2`, `5d44aef`, `30641ce`, `22ca266`, `2f75b33`, tag `v0.0.81` |
| 2026-04-10 | Self-hosted 1code-api backend service — Phase 1 endpoints (health, changelog, plan, profile) verified end-to-end in Docker against Postgres 18 + GHCR workflow dispatch (multi-arch amd64/arm64 + Cosign keyless + SLSA provenance + SBOM), `docker pull ghcr.io/jrmatherly/1code-api:v0.0.79-test` successful. Also fixed CVE-2026-39356 (drizzle-orm SQL injection, HIGH) and aligned 5 other packages with desktop app versions. 51/51 tasks, **ARCHIVED** — `self-hosted-api` promoted to baseline (7 reqs), `feature-flags` baseline +1 req | `2026-04-10-implement-1code-api` archived |
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
