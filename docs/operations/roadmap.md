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

### [In Progress] Eliminate `gray-matter` eval warning -- `replace-gray-matter-with-front-matter`

**Added:** 2026-04-09 · **Research completed:** 2026-04-11 · **Proposal landed:** 2026-04-11 (commit `b6187fb`)
**Status:** Research + OpenSpec proposal complete (0/67 tasks implemented). Implementation is **worktree-enforced** per `tasks.md` §1 + §13.
**Scope:** Replace `gray-matter@4.0.3` with `front-matter@4.0.2` behind a canonical shim at `src/main/lib/frontmatter.ts` to eliminate the Rollup `node_modules/gray-matter/lib/engines.js (43:13)` dynamic-code-evaluation warning. Four options were researched and narrowed to Option 2 (see `openspec/changes/replace-gray-matter-with-front-matter/design.md` Decisions 1-6 for rationale + alternatives). New micro-capability spec `frontmatter-parsing` (6 requirements / 15 scenarios) to be promoted at archive time. Two new regression guards (`no-gray-matter.test.ts`, `frontmatter-shim-shape.test.ts`) codify the canonical-shim rule.

**Key corrections to the original research assumptions** (all captured in the OpenSpec proposal + design):
- **Option 1 is empirically rejected**: passing `{ engines: { yaml: ... } }` at call sites does NOT silence the warning. Rollup's warning is static-analysis based, and `gray-matter/index.js` unconditionally requires the engine-loading machinery — call-site options cannot remove source code from the bundle. Confirmed via in-tree spike.
- **`front-matter` is NOT zero-deps**: it depends on `js-yaml@^3.13.1`, the same version gray-matter ships. The "7 packages drop out" claim was incorrect — only 3 packages actually drop under Option 2 (`gray-matter`, `section-matter`, `strip-bom-string`). The full 7-package reduction requires Option 3 (`vfile-matter` with modern `yaml@2`), which is ESM-only and forces an async refactor of every main-process parse helper — deferred to a future change.
- **Empirical validation passed**: in-tree spike verified all six quality gates clean after the swap (ts:check 0 errors, lint clean, build clean with **no** Rollup eval warning, 172 tests 0 fail, audit unchanged, docs build unchanged). Bundle introspection confirmed `parseMatter`/`engines.js` count = 0 in `out/main/index.js` and `FrontMatterResult`/`bodyBegin` count > 0 (parser is bundled, not externalized). Spike was reverted; `main` is unchanged.

**Effort:** Small (~2-3h implementation + PR review — research phase complete)
**Prereqs:** None
**Canonical reference:** `openspec/changes/replace-gray-matter-with-front-matter/` (proposal.md, design.md, specs/frontmatter-parsing/spec.md, tasks.md). Implementation trigger: `/opsx:apply replace-gray-matter-with-front-matter`.

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
**Canonical reference:** `docs/conventions/quality-gates.md` "Local-only lint advisory" section (current honest description of the drift).

### [Cleanup] Promote LiteLLM OSS vs Enterprise boundary from auto-memory to canonical doc

**Added:** 2026-04-11 (discovered during `project-orchestrator` skill review)
**Scope:** The LiteLLM OSS vs Enterprise feature boundary is currently captured in two auto-memory files at `~/.claude/projects/-Users-jason-dev-ai-stack-ai-coding-cli/memory/project_litellm_feature_boundary.md` and `feedback_litellm_oss_constraint.md` (received from the cluster agent on 2026-04-11 as an authoritative briefing). These are user-specific paths and not visible to collaborators or in tracked docs. Promote the content into a new canonical doc at `docs/enterprise/litellm-oss-boundary.md` covering: (1) the Enterprise-gated feature list (security, logging, spend, admin UI), (2) the OSS-available feature list (virtual keys, global guardrails, standard S3, routing), (3) the trust-the-edge Envoy Gateway workaround (`SecurityPolicy` + `claimToHeaders`), (4) the decision heuristic for features not explicitly listed, (5) authoritative sources with a "do NOT trust third-party blogs" callout. After the doc lands, update `project-orchestrator/SKILL.md` I5 row and `.serena/memories/project_overview.md` to cite the canonical doc alongside the auto-memory. The auto-memories stay as session-persistent hard-rule enforcers; the doc is the shareable reference.
**Effort:** Small (~30 min — content already exists in the auto-memory; just needs doc-ification + cross-linking)
**Prereqs:** None
**Canonical reference:** Current stable anchor lives in this roadmap file's P1 entry "Extend Envoy SecurityPolicy to cover `1code-api` HTTPRoute" which cites the `enable_jwt_auth` Enterprise gate and the `ValueError("JWT Auth is an enterprise only feature.")` source behavior.

---

## Recently Completed

| Date | Item | Change/Commit |
|------|------|---------------|
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
