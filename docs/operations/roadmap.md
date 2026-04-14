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

### [Ready] `add-dual-mode-llm-routing` live-cluster smoke tests

**Added:** 2026-04-14 (deferred during archive of `add-dual-mode-llm-routing` at 50/59 tasks)
**Scope:** Execute the 9 manual smoke-test tasks that were deferred when the change was archived on 2026-04-14. The archive proceeded because all code work (Groups 1-10 + 12) landed and the archive-ceremony tasks self-reference the archive command itself. Required smokes: (a) **§9.11 wizard smoke** — with `MAIN_VITE_DEV_BYPASS_AUTH=true` and an active `claude-subscription` account, verify the model-picker dropdown no longer shows the "Add Models" footer; toggle to `byok` and verify it reappears; (b) **§11.1–§11.5 live-cluster smokes** — start dev server with `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=false` + `MAIN_VITE_LITELLM_BASE_URL=https://llms.<cluster>` set, sign in with Entra, add a Claude Subscription account, send a chat and verify `[claude-auth]` logs show `Using CLAUDE_CODE_OAUTH_TOKEN: true` + `Using ANTHROPIC_BASE_URL: https://llms...` + `Using ANTHROPIC_AUTH_TOKEN: false`; delete account and verify idempotency (no re-seed, toast says "Account removed" exactly once); add BYOK account with `routingMode="litellm"`, click "Fetch Models" and verify three slots auto-fill; repeat with `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true` choosing direct routing for both account types. Task text preserved in `openspec/changes/archive/2026-04-14-add-dual-mode-llm-routing/tasks.md` §9.11 + §11.
**Prereqs:** Access to the Talos cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Envoy Gateway + LiteLLM deployed), a valid Entra login, and an active Claude Max subscription OAuth token. Optionally a second BYOK API key for the `byok-litellm` leg.
**Effort:** Small–Medium (mostly operator time, all code is already shipped)

### [Ready] Extend Envoy SecurityPolicy to cover `1code-api` HTTPRoute

**Added:** 2026-04-11 (discovered during CodeQL alert #28 remediation analysis)
**Scope:** The existing `SecurityPolicy/entra-oidc-jwt-auth` in `deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml` targets **only** the `litellm` HTTPRoute (`targetRefs[0].name: litellm`). The `1code-api` HTTPRoute at `deploy/kubernetes/1code-api/app/httproute.yaml` has **no** JWT validation and **no** `RequestHeaderModifier` filter to strip `x-user-*` headers from ingress. The service's `auth.ts:extractUser()` trusts `x-user-oid`/`x-user-email`/`x-user-name` headers unconditionally ("trust-the-edge" pattern) — which means any external client reaching the HTTPRoute could spoof the headers if Envoy doesn't validate them first. **JWT validation must happen in Envoy Gateway, not LiteLLM.** The cluster runs LiteLLM OSS only (no Enterprise license), and LiteLLM's `general_settings.enable_jwt_auth` is Enterprise-gated — it raises `ValueError("JWT Auth is an enterprise only feature.")` at startup (see `project_litellm_feature_boundary.md`). The canonical OSS pattern is Envoy Gateway `SecurityPolicy` + `claimToHeaders` validating the Entra JWT at the edge and injecting trusted `x-user-*` headers (briefing received from cluster agent 2026-04-11). Draft SecurityPolicy at `deploy/kubernetes/1code-api/app/securitypolicy.draft.yaml` (NOT in kustomization.yaml, so Flux does not reconcile it). Two safe remediations: (a) create a new SecurityPolicy for the `1code-api` HTTPRoute (what the draft does — preferred because 1code-api has no browser UI and must not inherit the LiteLLM OIDC redirect), or (b) extend `targetRefs` on the existing SecurityPolicy (rejected — the existing policy's OIDC redirect block would break the desktop client's error handling). Currently mitigated in layers by: `CiliumNetworkPolicy` locking ingress to Envoy pods, `PROVISIONING_ENABLED=false` keeping the routes inactive, and the UUID-format validation added to `getUserGroups()` in commit `9dd468a` as defense-in-depth. **Blocks flipping `PROVISIONING_ENABLED=true` in production.**
**Effort:** Small (SecurityPolicy edit + smoke test)
**Prereqs:** Cluster access to `/Users/jason/dev/ai-k8s/talos-ai-cluster/`, ability to verify SecurityPolicy `targetRefs` binding in a running Envoy Gateway
**Canonical reference:** `docs/enterprise/auth-strategy.md` §3.1 (cluster lock-down prerequisite), `deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml` (current SecurityPolicy), `deploy/kubernetes/1code-api/app/httproute.yaml` (target HTTPRoute), CodeQL alert #28 remediation commit `9dd468a`

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

### [Ready] 1code-api LiteLLM virtual-key auto-provisioning
**Added:** 2026-04-13
**Scope:** Replace the manual "paste your LiteLLM virtual key" UX step (add-dual-mode-llm-routing Group 9 wizard) with automatic provisioning. On Entra sign-in, Electron calls `1code-api` which provisions (or fetches existing) virtual keys per user via the LiteLLM `/key/generate` endpoint; the key is encrypted via `credential-store.ts` and stored on the `anthropicAccounts` row. Unblocks BYOK-via-LiteLLM and subscription-via-LiteLLM accounts in one click.
**Effort:** Medium
**Prereqs:** `add-dual-mode-llm-routing` archived; `1code-api` deployed with `PROVISIONING_ENABLED=true`
**Canonical reference:** [`openspec/changes/add-dual-mode-llm-routing/design.md`](../../openspec/changes/add-dual-mode-llm-routing/design.md) §Decision 4 · [`docs/enterprise/llm-routing-patterns.md`](../enterprise/llm-routing-patterns.md) (four-pattern matrix + `x-litellm-customer-id` attribution)

### [Ready] Migrate Ollama + legacy Jotai BYOK into deriveClaudeSpawnEnv
**Added:** 2026-04-13
**Scope:** `add-dual-mode-llm-routing` Group 5 intentionally scoped the pure-function rewire to `anthropicAccounts`-backed sessions only. The other two auth sources in `src/main/lib/trpc/routers/claude.ts` — Ollama via `finalCustomConfig` and BYOK via the renderer's `customClaudeConfigAtom` Jotai atom — still flow through the legacy `hasExistingApiConfig` branch. Follow-up change: add an `ollama` branch to `ProviderMode` and migrate the Jotai-atom BYOK records into `anthropicAccounts` rows so there is one source of truth for spawn-env assembly.
**Effort:** Medium
**Prereqs:** `add-dual-mode-llm-routing` archived; Group 9 UI wizard shipped so Jotai-atom BYOK users have a migration target
**Canonical reference:** `openspec/changes/add-dual-mode-llm-routing/tasks.md` Group 5 scoping note; `src/renderer/lib/atoms/index.ts` `customClaudeConfigAtom` + `OFFLINE_PROFILE`

### [Deferred] auth-manager.ts Phase D — full Strangler Fig retirement

**Added:** 2026-04-13 (carved out of `wire-login-button-to-msal` as deferred follow-up per `auth-strategy.md` §5.3.1 Step D)
**Scope:** Once `wire-login-button-to-msal` has been live in dev for 2+ weeks with no rollbacks, delete the legacy 21st.dev branch entirely from `src/main/auth-manager.ts`:
- `exchangeCode()` — POST `/api/auth/desktop/exchange` (already throws when flag is on)
- `refresh()` legacy `fetch` fallback — POST `/api/auth/desktop/refresh`
- `updateUser()` — PATCH `/api/user/profile` (already throws when flag is on)
- `fetchUserPlan()` — GET `/api/desktop/user/plan` (already returns null when flag is on)
- `getApiUrl()` / `getApiBaseUrl()` — return `apollosai.dev`
- The `Legacy21stUser` type union (if extant)
- Any consumer call sites still expecting these legacy methods

Result: `auth-manager.ts` becomes a pure delegating adapter to `enterprise-auth.ts`. The `enterpriseAuthEnabled` flag's "off" branch becomes "not yet provisioned" (already fail-fast as of `wire-login-button-to-msal`), no longer "use legacy SaaS."

**IMPORTANT:** New regression guards will be required when Phase D lands — the current `tests/regression/login-flow-uses-msal.test.ts` guard's scope is intentionally narrow to the dead-URL fallthrough. It does NOT cover the legacy `fetch(${apiUrl}/api/auth/desktop/exchange)`, `/api/auth/desktop/refresh`, `/api/user/profile`, or `/api/desktop/user/plan` fetch sites that Phase D will remove. Plan an additive guard at that time.

**Effort:** Small (cleanup, ~150 LOC removed)
**Prereqs:** `wire-login-button-to-msal` landed and stable in dev for 2+ weeks
**Canonical reference:** `docs/enterprise/auth-strategy.md` §5.3.1 Step D, `docs/enterprise/auth-login-button-wire-msal.md` §7

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
**Stable-release monitor:** `bun info electron-vite@latest version` must return `6.x.x`. Currently `5.0.0` (published 2025-12-07). Beta track has advanced: `6.0.0-beta.0` (2026-04-09) → `6.0.0-beta.1` (2026-04-12).
**Canonical reference:** `openspec/changes/upgrade-vite-8-build-stack/proposal.md` (Phase B)

> **2026-04-14 status refresh:** Vite 8 itself is stable and mature — `8.0.0` shipped 2026-03-12, now at `8.0.8` (2026-04-09). `@vitejs/plugin-react@6.0.1` stable since 2026-03-13. `@tailwindcss/vite@4.2.2` declares `vite: "^5.2.0 || ^6 || ^7 || ^8"` peer range (Vite-8-ready). Only blocker remaining is electron-vite 6.0.0 stable. Upstream iteration cadence (beta.0 → beta.1 in 3 days) suggests stable release is near. Pre-documented findings from `6.0.0-beta.1`: SWC retained as `^1.0.0` optional peer, Babel retained as `^7.29.0` internal dep — tasks.md §5.4/§5.5 are verification not migration.

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

### [Cleanup] Replace remaining 21st.dev brand assets

**Added:** 2026-04-13 (discovered during `wire-login-button-to-msal` UX review — login.html SVG was upstream geometry; raster build assets remain)
**Scope:** Replace upstream brand artifacts with apollosai.dev / 1Code enterprise marks:
- `build/icon.png`, `build/icon.ico`, `build/icon.icns` (Dock, taskbar, installer icons)
- `build/background.svg`, `build/background@2x.png`, `build/background.tiff` (DMG installer artwork)
- `build/dmg-background.svg`, `build/dmg-background.png`, `build/dmg-background@2x.png` (DMG drag-target artwork)
- Any other `build/*` or `resources/*` artifact carrying upstream branding (verify via brand audit before/after)

**Note:** The `src/renderer/login.html` SVG was already replaced with the canonical 1Code mark in `wire-login-button-to-msal` (see assertion 8 in `tests/regression/login-flow-uses-msal.test.ts`). This entry tracks the remaining raster + DMG artwork only.

**Effort:** Small once apollosai.dev brand mark assets are finalized (asset swap + visual smoke test on packaged builds for all 3 OSes)
**Prereqs:** apollosai.dev / 1Code enterprise brand mark assets finalized and provided
**Canonical reference:** `docs/conventions/brand-taxonomy.md` (Tier A/B/C classification rules), `docs/enterprise/auth-login-button-wire-msal.md`

### [Cleanup] Refresh distroless base image pin to clear CVE-2026-28390

**Added:** 2026-04-13 (during v0.0.84 container-build Trivy gate activation)
**Scope:** `services/1code-api/Dockerfile` pins `gcr.io/distroless/nodejs24-debian12@sha256:61f4f4341db8...`. The Debian bookworm base of this image carries `libssl3 3.0.18-1~deb12u2` which is vulnerable to CVE-2026-28390 (OpenSSL CMS NULL deref → DoS, DSA-6201-1). The fix (`3.0.19-1~deb12u2`) landed in bookworm-security on 2026-04-07 but upstream distroless hasn't rebuilt yet. Current state: `:latest` tag = same digest we pin (`61f4f4341db8...`). Mitigation in place: `.trivyignore` exempts CVE-2026-28390 with non-exploitability analysis (our service does not process CMS/S/MIME data). Action: monitor the distroless `:latest` digest — once it changes, bump `services/1code-api/Dockerfile`, re-run container-build, verify Trivy passes clean, remove the `.trivyignore` entry.
**Effort:** Trivial (single-line digest change + workflow re-run + remove exemption)
**Prereqs:** Wait for upstream distroless rebuild (typically <1 week after DSA)
**Canonical reference:** `.trivyignore` (exemption block with full justification)

### [Cleanup] Dependabot comment refresh

**Added:** 2026-04-09
**Scope:** Update `.github/dependabot.yml` comments and `.claude/skills/verify-pin/SKILL.md` to reflect current pin reasons. Partially superseded (`upgrade-typescript-6` archived 2026-04-10, `upgrade-electron-41` archived 2026-04-11, `upgrade-tailwind-4` archived 2026-04-10); `upgrade-vite-8-build-stack` still active (Phase B blocked).
**Effort:** Trivial
**Prereqs:** None

### [Cleanup] Promote `bun run lint` from local-only advisory to full CI gate

**Added:** 2026-04-11 (discovered during `project-orchestrator` skill review — cross-surface drift closure)
**Scope:** `bun run lint` (ESLint 10 flat config + `eslint-plugin-sonarjs` v4) currently exists as a real `package.json` script and is enforced locally (most sessions run it before commit), but it is NOT one of the 5 CI-enforced quality gates in `.github/workflows/ci.yml`. The current 5 CI gates are ts:check, build, test, audit, docs-build — lint is absent. To promote: (1) establish a lint-clean local baseline by fixing all existing warnings (`eslint.config.mjs` currently suppresses ~50 rules project-wide, documented per-rule), (2) add a new `lint` job to `.github/workflows/ci.yml` paralleling the existing gate pattern, (3) update the `status` aggregator to require the new job, (4) update `docs/conventions/quality-gates.md` to remove the "Local-only lint advisory" section and re-title to "Six Quality Gates", (5) update `.claude/rules/testing.md` similarly, (6) update `CLAUDE.md` line 53 to say "6 CI-enforced" instead of "5 CI-enforced + 1 local-only", (7) update the `project-orchestrator` skill's Step 6 gate list.
**Effort:** Small once the project is lint-clean; medium-large to GET there (unknown warning count until it runs clean).
**Prereqs:** Lint-clean local baseline. Until then this item stays parked.
**Follow-up (2026-04-12 research):** `eslint-plugin-sonarjs` v4.0.2 ships 268 rules, but 3 SonarLint-reported rules (S6582 `prefer-optional-chain`, S7776 `prefer-set-has`, S7758 `prefer-code-point`) are **not in the npm plugin** — they are `decorated`/`external` facades over `@typescript-eslint/eslint-plugin` and `eslint-plugin-unicorn`. To gain CLI coverage of these 3 rules, add both as devDependencies and enable `@typescript-eslint/prefer-optional-chain`, `unicorn/prefer-set-has`, `unicorn/prefer-code-point` in `eslint.config.mjs`. This is optional and should be evaluated alongside the broader lint-to-CI promotion. See `docs/conventions/quality-gates.md` § "SonarLint IDE vs. `bun run lint`" for the full analysis.
**Canonical reference:** `docs/conventions/quality-gates.md` "Local-only lint advisory" section + "SonarLint IDE vs. `bun run lint`" section (added 2026-04-12).

### [Cleanup] Promote LiteLLM OSS vs Enterprise boundary from auto-memory to canonical doc

**Added:** 2026-04-11 (discovered during `project-orchestrator` skill review)
**Scope:** The LiteLLM OSS vs Enterprise feature boundary is currently captured in two auto-memory files at `~/.claude/projects/-Users-jason-dev-ai-stack-ai-coding-cli/memory/project_litellm_feature_boundary.md` and `feedback_litellm_oss_constraint.md` (received from the cluster agent on 2026-04-11 as an authoritative briefing). These are user-specific paths and not visible to collaborators or in tracked docs. Promote the content into a new canonical doc at `docs/enterprise/litellm-oss-boundary.md` covering: (1) the Enterprise-gated feature list (security, logging, spend, admin UI), (2) the OSS-available feature list (virtual keys, global guardrails, standard S3, routing), (3) the trust-the-edge Envoy Gateway workaround (`SecurityPolicy` + `claimToHeaders`), (4) the decision heuristic for features not explicitly listed, (5) authoritative sources with a "do NOT trust third-party blogs" callout. After the doc lands, update `project-orchestrator/SKILL.md` I5 row and `.serena/memories/project_overview.md` to cite the canonical doc alongside the auto-memory. The auto-memories stay as session-persistent hard-rule enforcers; the doc is the shareable reference.
**Effort:** Small (~30 min — content already exists in the auto-memory; just needs doc-ification + cross-linking)
**Prereqs:** None
**Canonical reference:** Current stable anchor lives in this roadmap file's P1 entry "Extend Envoy SecurityPolicy to cover `1code-api` HTTPRoute" which cites the `enable_jwt_auth` Enterprise gate and the `ValueError("JWT Auth is an enterprise only feature.")` source behavior.

### [Deferred] Further `claude.ts` decomposition — decompose the 2,003-line chat subscription handler

**Added:** 2026-04-12 (follow-up to Phase C §7 of `security-hardening-and-quality-remediation`)
**Scope:** Phase C §7 reduced `src/main/lib/trpc/routers/claude.ts` from 3,309 → 2,503 lines (−24%) via four extractions: `prompt-parser`, `session-manager`, `mcp-resolver`, `tool-executor` (canUseTool factory). The original target of <1,000 lines was not met because the dominant remaining bulk is the **2,003-line `chat` tRPC subscription handler** (`claudeRouter.chat` at `src/main/lib/trpc/routers/claude.ts:201-~2200`). The handler owns deeply coupled state: `emit`/`safeEmit`/`safeComplete`, `parts[]`, `currentText`, `abortController`, `transform.on(...)` hooks, the `for await (const msg of stream)` message-processing loop, MCP symlink setup (~400 lines around line 1060-1165), server-config merging, and the `onAbort` + `finally` rollback cleanup. Further decomposition requires extracting: (a) `chat-stream-processor` (the for-await loop + transform wiring), (b) `chat-mcp-setup` (the symlink + server-config merge block), (c) `chat-cleanup` (onAbort + finally). Each captures enough observer state that a factory-function lift alone is insufficient — needs a small per-request context object passed through.
**Effort:** Large (multi-session)
**Prereqs:** None hard-blocking, but coordinate with active-chat.tsx decomposition (same session state flows cross-layer)
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §7.6 (line-count verification reported partial completion)

### [Deferred] Decompose `active-chat.tsx` (8,743 lines → focused components with React.memo)

**Added:** 2026-04-12 (Phase D §10.1 of `security-hardening-and-quality-remediation`)
**Scope:** `src/renderer/features/agents/main/active-chat.tsx` is the single largest renderer file at 8,743 lines. Decompose into focused child components (message list, input box, tool invocation panel, streaming indicator, stop button, etc.) and wrap expensive children in `React.memo` with custom equality checks. Prerequisite for adopting React 19 concurrent features (Suspense, useTransition).
**Effort:** Large (multi-session)
**Prereqs:** Phase C §7 `claude.ts` decomposition complete (sets the precedent + extracts shared session-manager that active-chat.tsx consumes)
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.1

### [Deferred] Adopt React 19 features (lazy/Suspense code-splitting, useTransition for streaming, use() hook)

**Added:** 2026-04-12 (Phase D §10.2 of `security-hardening-and-quality-remediation`)
**Scope:** The renderer bundle is ~15.6 MB main chunk. React 19 ships `use()`, `useTransition`, Suspense for data, and `<Activity>` for pre-rendering hidden tabs. Combine with Vite `manualChunks` splitting (Phase C §8.5) to lazy-load Monaco, mermaid, katex, cytoscape chunks on-demand. Target: first-paint main chunk < 5 MB.
**Effort:** Large (multi-session)
**Prereqs:** Phase C §8.5 bundle splitting complete (manualChunks in `electron.vite.config.ts`)
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.2

### [Deferred] Enable TS strictness flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)

**Added:** 2026-04-12 (Phase D §10.3 of `security-hardening-and-quality-remediation`)
**Scope:** Two TypeScript 6 strictness flags still disabled: `noUncheckedIndexedAccess` (catches `arr[i]` returning `T` instead of `T | undefined` on out-of-bounds), `exactOptionalPropertyTypes` (distinguishes `{x?: T}` from `{x: T | undefined}`). Enabling them currently produces hundreds of new errors across the codebase. Per-module fixes required.
**Effort:** Medium (systematic, can be parallelized per-directory)
**Prereqs:** None — §8.7 `as any` sweep complete 2026-04-12 (96 → 3; only 2 legitimate SDK message-union escapes remain in claude.ts with justification comments)
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.3

### [Ready] Restructure `provisioning.ts` transaction — move external API calls outside PostgreSQL transaction boundary (saga pattern)

**Added:** 2026-04-12 (Phase D §10.4 of `security-hardening-and-quality-remediation`)
**Scope:** `services/1code-api/src/services/provisioning.ts` calls the LiteLLM API inside a PostgreSQL transaction, holding the row lock for the duration of the remote HTTP round-trip. Under load this can cascade into connection-pool exhaustion. Refactor to the **saga pattern**: (1) commit local DB state → (2) call LiteLLM API → (3) commit result in a second local transaction, with compensating transactions for partial failures.
**Effort:** Medium (needs careful rollback-path design + new integration tests)
**Prereqs:** None
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.4

### [Ready] Wire integration tests into CI — docker-compose harness + scheduled workflow for 10 skipped tests

**Added:** 2026-04-12 (Phase D §10.5 of `security-hardening-and-quality-remediation`)
**Scope:** `services/1code-api/tests/integration/` contains 10 tests that currently skip without a docker-compose harness (PostgreSQL + LiteLLM fixtures). Add a `.github/workflows/integration-test.yml` scheduled workflow (nightly at 03:00 UTC) that spins up `docker-compose.test.yml`, runs the integration suite with `INTEGRATION_TEST=1`, and fails loudly on regressions. Out of the critical-path CI (too slow) but catches regressions before release.
**Effort:** Medium (docker-compose file exists; wiring + secrets injection + flake budget needed)
**Prereqs:** None
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.5

### [Deferred] Add renderer test infrastructure — vitest + @testing-library/react for critical UI paths

**Added:** 2026-04-12 (Phase D §10.6 of `security-hardening-and-quality-remediation`)
**Scope:** The renderer has zero test coverage — all 231 tests target the main process or `services/1code-api/`. Add `vitest` + `@testing-library/react` and write tests for critical UI paths: sign-in flow, chat send/receive, streaming indicator, error recovery. Start with the 5 most-used components, expand over time.
**Effort:** Large (new framework + fixture setup + initial test authorship)
**Prereqs:** None (but benefits from Phase D §10.1 `active-chat.tsx` decomposition for easier isolated testing)
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.6

### [Ready] Empty catch block audit (~79 sites) — add structured error logging or explicit rationale comments

**Added:** 2026-04-12 (Phase D §10.7 of `security-hardening-and-quality-remediation`)
**Scope:** ~79 empty `catch {}` or `catch (e) {}` blocks across the codebase silently swallow errors. Systematically audit each site and either (a) add structured error logging via the project's logger, or (b) add an explicit comment explaining why the error is intentionally ignored (e.g., "fallback path — primary handler logs"). Prevents future silent-failure debugging pain.
**Effort:** Medium (systematic, per-directory)
**Prereqs:** None
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.7

### [Deferred] Reduce unbounded module-level Maps in `active-chat.tsx` — add LRU eviction or WeakMap patterns

**Added:** 2026-04-12 (Phase D §10.8 of `security-hardening-and-quality-remediation`)
**Scope:** `active-chat.tsx` declares several module-level `Map` instances (per-message state caches, tool invocation tracking) that grow unbounded over a long session. Convert to either `LRUCache` (bounded by count) or `WeakMap` (auto-GC when keys are unreachable). Particularly relevant for the tool invocation result cache which retains payloads for every tool call across all sessions.
**Effort:** Medium (needs profiling to confirm which Maps leak + per-Map refactor decisions)
**Prereqs:** Phase D §10.1 `active-chat.tsx` decomposition complete (easier to reason about isolated Maps after split)
**Canonical reference:** `openspec/changes/archive/2026-04-13-security-hardening-and-quality-remediation/tasks.md` §10.8

### [Ready] Settings UI for feature-flag runtime toggling

**Added:** 2026-04-13 (Group 19 of `remediate-dev-server-findings`)
**Scope:** Today every feature flag (`enterpriseAuthEnabled`, `auxAi*`, `voiceViaLiteLLM`, etc.) is toggled via `setFlag()` in the dev console or by a direct DB write. Add a Settings panel that lists every flag from `getAllFlagsWithSources()` with its current value, source (default/override/env), and an inline editor (toggle/string/number). Particularly valuable for the `auxAi*` flags — operators currently have no UI to disable AI title generation if it misbehaves in production.
**Effort:** Medium (Settings page wiring + tRPC procedure + source-aware editors)
**Prereqs:** None
**Canonical reference:** `src/main/lib/feature-flags.ts` `getAllFlagsWithSources()`, `openspec/changes/remediate-dev-server-findings/tasks.md` §19.1

### [Deferred] Codex-direct / Codex-litellm provider modes in aux-ai dispatch

**Added:** 2026-04-13 (Group 19 of `remediate-dev-server-findings`)
**Scope:** When the Codex integration workstream formalizes ProviderMode kinds for Codex (likely `codex-direct` and `codex-litellm`), extend the dispatch matrix in `src/main/lib/aux-ai.ts` (`makeGenerateChatTitle` + `makeGenerateCommitMessage`) to route those modes to the appropriate SDK. Today Codex sub-chats fall through to the Ollama-or-truncated path because the matrix only knows about Anthropic-shaped modes.
**Effort:** Small (one new branch per kind in two factories + extend the regression guard)
**Prereqs:** Codex ProviderMode types added to `spawn-env.ts`
**Canonical reference:** `src/main/lib/aux-ai.ts`, `openspec/changes/remediate-dev-server-findings/tasks.md` §19.2

### [Ready] Runtime drift detection for landed migrations

**Added:** 2026-04-13 (Group 19 of `remediate-dev-server-findings`)
**Scope:** `drizzle/0010_flowery_blackheart.sql` is hand-edited (documented exception in `.claude/rules/database.md`). To prevent silent divergence between the SQL and the snapshot (`drizzle/meta/0010_snapshot.json`) in future hand-edits, add a subagent-driven check that regenerates the snapshot from the schema + applied migration and diffs it against the committed snapshot. Wire into the existing `db-schema-auditor` subagent or as a new `tests/regression/migration-drift.test.ts` shape guard.
**Effort:** Small (one new subagent prompt or one regression guard)
**Prereqs:** None
**Canonical reference:** `drizzle/0010_flowery_blackheart.sql` top comment, `.claude/rules/database.md` "Allowed exceptions" section, `openspec/changes/remediate-dev-server-findings/tasks.md` §19.3

### [Ready] `fix-preferred-editor-detection` manual smoke tests

**Added:** 2026-04-14 (deferred from archived `fix-preferred-editor-detection` G7)
**Scope:** Three manual smoke-test scenarios deferred when the change archived (operator not available for interactive app runs): (7.1) `bun run dev` on macOS → Settings → Preferences → Preferred Editor confirms the dropdown shows only installed editors and the trigger button no longer reads "Cursor" when Cursor is absent; (7.2) delete per-OS app-data directory to simulate a fresh install → relaunch → trigger button resolves to OS default or first installed editor, never "Cursor" when Cursor isn't installed; (7.3) Windows VS Code-installed vs VS-Code-absent verification confirms the dropdown reflects detection (catches any latent `where.exe` / `PATHEXT` regression in `which` on Windows). Automated coverage (regression guard `preferred-editor-reflects-installed.test.ts` + TS baseline + build + docs build) already asserts the code shape and null-safety; these smokes verify the runtime UX. Low-risk: each scenario is seconds of manual clicking.
**Effort:** Trivial (≤15 min across all three scenarios)
**Prereqs:** Local macOS dev environment + optional Windows VM
**Canonical reference:** `openspec/changes/archive/2026-04-14-fix-preferred-editor-detection/tasks.md` §7.1-7.3

---

## Recently Completed

| Date | Item | Change/Commit |
|------|------|---------------|
| 2026-04-14 | **`add-entra-graph-profile` — §1-§8 + §10.1 + §11 shipped (39/45)** — Graph `User.Read` delegated scope added to `DEFAULT_SCOPES` + `acquireTokenForGraph()` silent token helper + `src/main/lib/graph-profile.ts` (`fetchGraphProfile()` with 2 parallel Graph calls — `/me?$select=displayName,mail,jobTitle,department,officeLocation` + `/me/photo/$value` with 404/403 tolerance on the photo endpoint). `AvatarWithInitials` component with FNV-1a deterministic HSL hue from oid. Account tab refactored: avatar + display name header (editable Full Name row removed — local edits never propagated to Entra), 4 read-only rows (Email, Job Title, Department, Office Location). `enterpriseAuth.getGraphProfile` tRPC query added to existing router (count stays at 23). Admin-consent documentation in `docs/enterprise/entra-app-registration-1code-api.md` Step 5a/5b + cross-links from `auth-strategy.md` + `CLAUDE.md`. 2 new shape-based regression guards (`graph-profile-404-fallback` + `graph-avatar-data-url-shape`, 15 tests). All 6 quality gates green. Manager field investigated but tenant returns 403 — deferred pending admin policy review. Remaining: §9 manual smoke (verified end-to-end in dev), §10.2-10.4 commit/sync/archive. | commit `bff9567` |
| 2026-04-14 | **`wire-login-button-to-msal` — 45/57 tasks shipped, archived with deferred smokes** — MSAL sign-in flow wired end-to-end: typed `AuthError` discriminated union, login.html accessible DOM-resident toast with safe text-only DOM mutation, `completeAuthSuccess` shared helper extracted from legacy `handleAuthCode`, dev-only env-var override for `enterpriseAuthEnabled` flag (`!app.isPackaged` gate), canonical 1Code SVG geometry in login.html with a11y attrs. +8 requirements promoted across 3 baselines: brand-identity 11→12, enterprise-auth-wiring 4→10, feature-flags 7→8. Total baselines: 17 specs, 136 requirements. **Deferred:** §11 manual smoke tests (11.1-11.10) — happy path verified organically during `add-entra-graph-profile` dev sessions (MSAL sign-in → Account tab → Graph profile render). Negative paths (config-missing, flag-off, invalid-value, rollback, packaged-build) not yet exercised. | archived at `openspec/changes/archive/2026-04-14-wire-login-button-to-msal/` |
| 2026-04-14 | **`fix-preferred-editor-detection` — 24/31 tasks shipped, archived** — Cross-platform Preferred Editor detection via `npm which` (commit `a38a9f1`). Three upstream bugs eliminated: (1) fail-open filter in `agents-preferences-tab.tsx` that rendered the full `EDITORS` list while `getInstalledEditors` was in flight → now fail-closed `: []` + `"Detecting editors…"` disabled trigger. (2) Hard-coded `"cursor"` default in `preferredEditorAtom` → now `null`, type widened to `ExternalApp \| null`. (3) macOS-only `isAppInstalled()` path check → now async `which(cliBinary, {nothrow:true})` first, `.app` path as secondary fallback for GUI-only editors. New tRPC procedure `external.getOsDefaults` reads `$VISUAL`/`$EDITOR`/`$TERM_PROGRAM`/`$SHELL` with no `process.platform` branching. First-paint `useEffect` resolves null via OS default → first installed → null. Ten renderer consumers null-guarded (`open-in-button`, `agent-diff-view`, `changes-view`, `changes-widget`, `files-tab`, `info-section`, `file-viewer-sidebar`, `image-viewer`, `markdown-viewer`, `agents-preferences-tab`). New regression guard `preferred-editor-reflects-installed.test.ts` (3 shape-based cases). Archive promoted **+2 requirements** to `renderer-data-access` baseline (5→7). All 5 CI gates + lint green; TS baseline 0. **Deferred per user:** G7 manual smoke tests 7.1-7.3 (bun run dev → Settings → Preferences verification; fresh-install simulation; Windows VS Code verification). | `2026-04-14-fix-preferred-editor-detection` archived, commit `a38a9f1` |
| 2026-04-14 | **`add-dual-mode-llm-routing` — 50/59 tasks shipped, archived with deferred smokes** — Decouples app-to-user auth (Entra ID) from CLI-to-Anthropic auth (Claude OAuth or BYOK). Introduces an explicit account-type × routing-mode model with a pure `deriveClaudeSpawnEnv(mode, liteLlmBaseUrl?)` function in `src/main/lib/claude/spawn-env.ts` as the ONLY code path that assembles Claude CLI auth env vars. Four routing modes (`subscription-direct`, `subscription-litellm`, `byok-direct`, `byok-litellm`) gated by `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` (defense-in-depth — unset or `false` silently locks the onboarding wizard to LiteLLM routing). Groups 1-10 + 12 landed: schema + types foundation, credential storage tier discrimination, ProviderMode + spawn-env derivation, `litellmModels` tRPC router (commit `6354ea6`) with 23rd router in `createAppRouter`, Settings UI wizard §9.1-§9.10 including subscription-aware model-picker gate (commit `336a0ac`), CI-gate validation push (commit `9938a9a`). Archive promoted **+10 new baseline requirements, +1 new baseline** (`llm-routing`); modified `claude-code-auth-import`, `credential-storage`, `enterprise-auth`. Baseline totals 16→17 specs, 116→127 requirements. Delta-authoring bug caught during archive: `claude-code-auth-import` delta had a `## REMOVED Requirements` block citing "Legacy claudeCodeCredentials mirror write" that was never promoted to baseline (that behavior lived in code, not spec). Fixed by deleting the orphan block — the behavioral change is already covered by the existing baseline requirement "Renderer Claude Code authentication uses importSystemToken exclusively". **Deferred to roadmap:** 9 manual smoke tests (§9.11 wizard + §11.1-§11.5 live cluster + §13 archive-ceremony tasks that self-reference this archive). See new roadmap entry "`add-dual-mode-llm-routing` live-cluster smoke tests" in the Ready section. | `2026-04-14-add-dual-mode-llm-routing` archived, commits `6354ea6`, `5948383`, `336a0ac`, `9938a9a`, `a60d7d1` |
| 2026-04-13 | **Safe dependency bumps + three new OpenSpec UI-enhancement tracks scaffolded** — Orchestrated via `/project-orchestrator` following an annotated-screenshot UI triage. (1) Scaffolded three change tracks from `.scratchpad/2026-04-13-ui-issues-findings.md` (now archived): `add-dual-mode-llm-routing` §9.8-§9.11 appended as tasks + new ADDED Requirement "Subscription-aware model picker access control" in `llm-routing` delta + one-bullet proposal scope extension; `fix-preferred-editor-detection` (0/31, MODIFIED `renderer-data-access` spec, archives with baseline promotion — npm `which` PATH detection + `$VISUAL`/`$EDITOR`/`$TERM_PROGRAM`/`$SHELL` OS-default derivation pattern ported from `/Users/jason/dev/shipit/`); `add-entra-graph-profile` (0/45, MODIFIED `enterprise-auth` baseline — `User.Read` delegated scope + Graph `/me?$select=displayName,mail,jobTitle,department,officeLocation` + `/me/photo/$value` with base64 data-URL conversion + `<AvatarWithInitials>` deterministic-`oid`-hash pastel fallback + pre-flight Entra admin-consent documentation in `docs/enterprise/`). Issue #2 (login logo) diagnosed as stale build — no change needed; `brand-sweep-complete.test.ts` already guards source regression. (2) Safe dep bumps: `typescript-eslint` 8.58.1→8.58.2, `@anthropic-ai/claude-agent-sdk` 0.2.104→0.2.105, `@ai-sdk/react` 3.0.160→3.0.161, `ai` 6.0.158→6.0.159, `posthog-js` 1.367.0→1.368.0 — all verified additive-only via `gh release view`. (3) Major-bump audits via ground-truth source diff: `@anthropic-ai/sdk` ^0.81.0→^0.88.0 (seven minors audited; `ClientOptions` + `messages.create()` + `TextBlock` identical between `sdk-v0.81.0` and `sdk-v0.88.0`; only usage in `src/main/lib/aux-ai.ts` via narrow `AnthropicLike` interface) + `diff` ^8.0.4→^9.0.0 (all three API signatures — `applyPatch` / `reversePatch` / `parsePatch` — identical; dropped `@types/diff` since v9 bundles its own types). All six quality gates green after each commit. (4) Archived six `.scratchpad/` triage docs into `.scratchpad/archive/` after cross-referencing coverage in archived changes + roadmap. | commits `3def1a8` (openspec scaffold), `8cf843a` (5 patch bumps), `92f6921` (@anthropic-ai/sdk + pinned-deps.md), `f8129ec` (diff v9 + dropped @types/diff) |
| 2026-04-13 | **`remediate-dev-server-findings` — 63/71 tasks shipped, archived** — Provider-aware aux-AI dispatch at `src/main/lib/aux-ai.ts` replaces the upstream `apollosai.dev/api/agents/*` call sites (F11 sub-chat name + F12 commit message, RESOLVED 3/4 modes). DI factory pattern + `LegacyCustomConfig` bridge wires the Custom Model onboarding path (localStorage Jotai atom `customClaudeConfigAtom`) through to aux-AI when `getActiveProviderMode()` returns null — runtime-verified via dev-server smoke (`SDK success (legacy customConfig) → "Testing Identity Check"` against `https://llms.aarons.com`). Signed-fetch upstream-disabled gate with 60s negative cache; undici-aware `recordUnreachable` unwraps `err.cause?.code` + accepts `TypeError("fetch failed")`. 4 new feature flags (`auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`). Per-route model defaults: `gpt-5-nano` for LiteLLM, `claude-haiku-4-5` for byok-direct (retired `claude-3-5-haiku-latest` eliminated). BYOK OAuth leak prevention + Entra-to-AUTH_TOKEN project-wide guard + per-kind expected-key-set matrix for spawn-env invariants. 5 new regression guards (aux-ai-provider-dispatch 18 tests, no-apollosai-aux-ai-fetch, signed-fetch-cache, raw-logger-concurrent-writes, no-legacy-oauth-byok-leak). Structured `[aux-ai]` breadcrumbs for runtime observability. Critical-path smoke verified (18.3 subscription-direct + 18.5 LiteLLM); remaining scenarios (18.1-2, 18.4, 18.6-9) deferred to future operator sessions. Archive promoted **+7 requirements, +1 new baseline** (`observability-logging`); `renderer-data-access` 5→9, `feature-flags` 6→7, `claude-code-auth-import` 2→3, `enterprise-auth` modified. Baseline totals 15→16 specs, 109→116 requirements. | `2026-04-13-remediate-dev-server-findings` archived, commits `0f43165`, `3b37397`, `96af6c5`, `01d451e`, `8ef644b`, `4bc809c`, `b89d282` |
| 2026-04-13 | **v0.0.85 release — full CI/release infrastructure green** — Phase C §7 claude.ts decomposition (4 new modules — prompt-parser, session-manager, mcp-resolver, tool-executor; 3309 → 2503 lines) + archived `security-hardening-and-quality-remediation` change (+18 requirements, 2 new baselines: `electron-security-hardening`, `sqlite-performance`) + release-infrastructure fix stack. Caught and fixed during v0.0.83 → v0.0.84 → v0.0.85 iteration: (1) `--follow-tags` lightweight-tag trap — tag never reaches remote when `git tag` (no `-a`) is used; fixed `/release` skill + `docs/operations/release.md` + `.claude/PROJECT_INDEX.md` to use `git tag -a -m` + `git push origin main <tag>`. (2) Container-build Trivy `image-ref: :${{ github.sha }}` vs `docker/metadata-action type=sha,prefix=` — full 40-char SHA ≠ 7-char SHA tag that gets pushed; fixed to `@${{ steps.build.outputs.digest }}` (content digest). (3) Cosign `DIGEST: ${{ steps.meta.outputs.digest }}` — non-existent output on metadata-action; silently fell back to signing by mutable tag; fixed to `steps.build.outputs.digest` (build-push-action). (4) CVE-2026-28390 in distroless openssl libssl3 3.0.18 — documented non-exploitability in `.trivyignore` (our service doesn't process CMS/S/MIME) + roadmap entry to refresh pin when upstream rebuilds. (5) Windows NSIS 502 flake observed in v0.0.83 — transient GitHub CDN, no code fix, retried clean. Net artifacts: 17 Electron installers (macOS arm64+x64 dmg/zip, Linux AppImage+deb, Windows exe+installer, 4 update manifests) + multi-arch container image signed by Cosign with keyless GitHub OIDC. First-ever full green on container pipeline (previously Trivy blocked signing step). | `v0.0.85` published at https://github.com/jrmatherly/1dev/releases/tag/v0.0.85, release commits `af030fc → 8949f17` |
| 2026-04-13 | **`security-hardening-and-quality-remediation` — Phase A+B+C+D complete, archived** — 81/81 tasks shipped across 4 phases (Phase A immediate security + CI P0 items; Phase B quick wins: performance caches, SQLite pragmas, FK indexes, TS-quality dead-code, lint config, deployment hardening; Phase C: CSP audit + CodeQL/Trivy/SSRF guards, claude.ts decomposition (4 new modules — prompt-parser, session-manager, mcp-resolver, tool-executor; 3309 → 2503 lines), safeJsonParse, authedProcedure middleware, manualChunks bundle splitting, sandbox:true runtime validation, `as any` sweep 96 → 3 (97% elimination), architecture doc fill-in; Phase D — deferred roadmap entries codified §10.1-§10.8). Archive promoted **+18 requirements, +2 new baselines** (`electron-security-hardening` 4 reqs, `sqlite-performance` 3 reqs); expanded `credential-storage` 7→8, `self-hosted-api` 11→17, `documentation-site` 5→9. Baseline totals 13→15 specs, 91→109 requirements. `/opsx:verify` caught 3 delta specs mislabeled `## MODIFIED Requirements` (headings didn't match baselines) → flipped to `## ADDED Requirements` before archive. Partial §7.6 (claude.ts < 1000-line target missed at 2503) tracked as P3 roadmap entry "Further claude.ts decomposition". | `2026-04-13-security-hardening-and-quality-remediation` archived, final commits `af030fc → a964d7d` |
| 2026-04-12 | **CI test job fix — install `services/1code-api/` deps before `bun test`** — Followup to the gray-matter PR that surfaced a latent CI bug: the test job was running `bun install --frozen-lockfile` only at the repo root, but `services/1code-api/` is a standalone subdirectory (not a bun workspace) with its own `package.json` declaring `fastify`, `yaml`, `gray-matter`, `drizzle`. When `bun test` walked the repo it discovered service test files that failed with `Cannot find package 'fastify'`. The bug had been silently broken on `main` since the LiteLLM provisioning archive on 2026-04-11 — no PR exposed it because no PR was opened against the post-archive `main` until #14. PR #14 cascaded the failure: removing gray-matter from the root broke parent-walk resolution for `services/1code-api/src/routes/changelog.ts`, surfacing the underlying CI gap. Fix mirrors the docs-build job pattern (working-directory: services/1code-api + bun install --frozen-lockfile). PR #14 was merged with `--admin` override knowing this fix needed to land immediately after; PR #15 landed clean. | PR #15 merged as `9efefc9` |
| 2026-04-12 | **`replace-gray-matter-with-front-matter` — eliminated Rollup eval warning** — `gray-matter@4.0.3` swapped for `front-matter@4.0.2` behind a canonical shim at `src/main/lib/frontmatter.ts`. 8 consumer call sites across 4 routers (`commands`, `plugins`, `skills`, `agent-utils`) updated. `electron.vite.config.ts` `externalizeDeps.exclude` swapped `gray-matter` → `front-matter`. Latent bug surfaced and fixed at `agent-utils.ts:81` (`VALID_AGENT_MODELS.includes(data.model)` was silently bypassing validation for non-string values; explicit `typeof === "string"` guard achieves the same observable result via a sound type narrow). Two new test files (`no-gray-matter.test.ts` regression guard + `frontmatter-shim-shape.test.ts` unit test) codify the canonical-shim rule. Test count 199 → 207 (+8 cases across +2 files / 35 → 37 files). All 6 gates green; bundle introspection confirms `parseMatter`/`engines.js` = 0 in `out/main/index.js`, `bodyBegin` count = 3. Manual smoke test validated Commands / Agents / Skills / Plugins panels parse correctly against `~/.claude/` (also surfaced an unrelated YAML syntax bug in `~/.claude/agents/zk-steward.md` which was fixed locally). **Factual corrections from `proposal.md` "Impact" preserved**: 3 packages dropped (not 7); Option 1 (engines override) empirically does not work; Option 3 (vfile-matter) deferred pending an ESM-in-main refactor. **Worktree gotcha learnings codified**: a fresh worktree needs THREE additional install steps the spec didn't anticipate (services/1code-api install, docs install, codex:download). Capability spec `frontmatter-parsing` (6 requirements / 15 scenarios) promoted to baseline, growing baseline from 12 → 13. | `2026-04-12-replace-gray-matter-with-front-matter` archived, PR #14 merged as `f6bf3fb` |
| 2026-04-11 | **SonarLint remediation for `src/renderer/features/{changes,automations,details-sidebar,file-viewer,sidebar,terminal,layout,kanban,mentions}/**`** — ~107 actionable findings across 33 files resolved in 3 commits orchestrated via the `project-orchestrator` skill (third real-world use; 82% the volume of the morning's `agents-*` cleanup). 28 files changed with dead-code removal, modern API migrations, Set conversions, duplicate import merges, case block scope, accessibility fixes, and one redundant jump. Buckets: A=dead code (26 S1128 unused imports + 17 S1854 useless assignments), B=modern API (S7773/S7755/S6594/S7754/S7747/S7770/S7753/S7723/S6606/S4043), C=Sets (IMAGE_EXTENSIONS/UNSUPPORTED_EXTENSIONS/githubCommentTriggers), D=duplicate-import merges (6× jotai + trpc/trpcClient + changes-view changes-types), E=case block scope in details-sidebar diff case, F=accessibility (added `role="listbox"` to keyboard-navigable file list, `role="button"` to subchat items, and **real a11y bug fix**: added `aria-selected` + roving `tabIndex` to `files-tab.tsx` treeitem), G=redundant `return;` in agents-subchats-sidebar. 2 S6819 findings intentionally skipped (click-to-dismiss tooltip pattern, suppressed project-wide). New SonarLint gotchas captured in `.serena/memories/style_and_conventions.md`: S6845 tabIndex fix is usually ADD a role not REMOVE tabIndex; S6807/S6852 treeitem needs roving tabindex + aria-selected; S7747 Set iterable; S4043 toSorted; S7770 filter(Boolean); S7753 indexOf-with-strict-eq-only; S6606 nullish-compound; S3626 void-return safety; S7723 Array.from over spread. TS baseline remained 0. | commits `ae9f634`, `ce57929`, `c71b9cb` |
| 2026-04-11 | **SonarLint remediation for `src/renderer/features/agents/**`** — ~130 findings across 30 files resolved in 4 commits orchestrated via the newly-promoted `project-orchestrator` skill (second real-world use after the `components/ui` cleanup earlier the same day). 28 files changed, net −266 lines. Buckets: A=dead code (S125 142-line commented block + 17 unused imports + 19 useless assignments), B=modern API migrations (S7773 parseInt→Number.parseInt, S7755 arr[length-N]→arr.at(-N), S6594 non-global .match→RegExp.exec, S7758 charCodeAt→codePointAt for byte strings only, S7762 parent.removeChild→child.remove, S7753 findIndex===→indexOf, S6606 nested-null ternary→??, S6644 redundant ternary→\|\|, S7766 guard-ternary→Math.max, S6353 `[^0-9]`→`\D`), C=Set-based modifier lookups (S7776 `filter+includes`→`new Set+has`), D=merged duplicate icon imports (S3863), E=switch refactor to `EXTENSION_ICON_MAP` lookup table in `agents-file-mention.tsx` (S1479 34-case + S6836 lexical decl), F=.find over .filter[0] (S7750), manual review of S4158 teams stub documented as F3 Option B placeholder. TS baseline stayed at 0 throughout. 11 findings intentionally skipped: 8×S6819 + 3×S6847 already suppressed project-wide in `.vscode/settings.json` (click-to-dismiss tooltip patterns). Key learning: preferred refactor for long switches is a `Record<string, T>` lookup table — captured in `.serena/memories/style_and_conventions.md` "SonarLint remediation gotchas" section along with 6 other gotchas (charCodeAt/codePointAt hash semantics, S7776 false-fires on strings, `.at(-N)` introduces undefined, S6594 global-flag incompat, F-entry stubs shouldn't be suppressed, S2589 auto-resolves after dead-code removal). | commits `dd00aa0`, `542a735`, `8eb70be`, `646e4d6` |
| 2026-04-11 | **CodeQL remediation + project-orchestrator skill + 5-vs-6 gates drift closure** — Three threads of work: (1) CodeQL alerts #28 (`js/request-forgery` CRITICAL) and #29 (`js/polynomial-redos` HIGH) in the freshly-shipped `services/1code-api` both closed via input-validation hardening — `OID_PATTERN` UUID validation in `graph-client.ts:getUserGroups()` and `MAX_SLUG_INPUT_LENGTH = 256` cap + split anchored regex in `slugify.ts`. Discovered during the analysis that the existing Envoy `SecurityPolicy/entra-oidc-jwt-auth` targets only the `litellm` HTTPRoute — the `1code-api` HTTPRoute has no JWT validation on ingress, mitigated today only by `CiliumNetworkPolicy` + `PROVISIONING_ENABLED=false`. Added P1-Ready roadmap entry + draft `deploy/kubernetes/1code-api/app/securitypolicy.draft.yaml` (not in kustomization.yaml, Flux doesn't reconcile). (2) Received authoritative LiteLLM OSS vs Enterprise boundary briefing from cluster agent — saved as auto-memory `project_litellm_feature_boundary.md` + `feedback_litellm_oss_constraint.md`, added P3-Cleanup roadmap item to promote to `docs/enterprise/litellm-oss-boundary.md`. (3) Created `project-orchestrator` skill (382 lines, modeled on cluster repo's `/taskforce` but recontextualized — Step-0 hard-rule gate for 10 rule triggers, skill-first check, task-type routing table with active-OpenSpec-change detection, 5-CI-gate + 1 local-only lint advisory verification). Researched in `.scratchpad/` with `project-orchestrator-skill-research.md`, reviewed via `superpowers:code-reviewer` subagent (2 Critical + 5 Important + 8 Minor findings, all resolved before promotion). Discovered cross-surface drift during the fix: CI enforces 5 gates not 6 (lint is local-only); closed in `docs/conventions/quality-gates.md`, `.claude/rules/testing.md`, and `CLAUDE.md`. Added P3-Cleanup roadmap item to promote lint to CI gate once the project is lint-clean. Skill inventory now 17 (16 routing targets + the orchestrator). | commits `9dd468a`, `294d6f1`, `633738c`, `970b088`, `db95bd9`, `105b66e`, `8a05388` |
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
