## Context

The 1Code enterprise fork (v0.0.82) is approaching production readiness. Phase 0 is complete (15/15 gates), enterprise auth is wired via Strangler Fig adapter, and the 1code-api backend is deployed. However, an 8-agent comprehensive code review identified 112 de-duplicated findings, with 6 items blocking production deployment and 32 additional improvements across performance, quality, CI, and documentation.

The codebase is a three-layer Electron app (main process + preload + renderer) with tRPC over IPC — NOT over HTTP. This architectural fact significantly changes the risk profile of several findings: tRPC procedures are not network-accessible, but the main process does make authenticated HTTP requests on behalf of the renderer (signedFetch/streamFetch), and shell.openExternal can be invoked from renderer-controlled URLs.

The deployment target is a Talos Kubernetes cluster with Envoy Gateway, LiteLLM OSS, and Flux v2 GitOps. The `deploy/` manifests in this repo are reconciled by Flux — changes here propagate automatically to the cluster.

## Goals / Non-Goals

**Goals:**
- Block SSRF via signedFetch/streamFetch before production deployment
- Block arbitrary protocol handlers via shell.openExternal
- Promote the SecurityPolicy from draft to deployed state
- Enable CiliumNetworkPolicy default-deny for production network isolation
- Fix the 12 highest-impact/lowest-effort items (performance caches, DB indexes, type augmentation, doc fixes)
- Establish foundations for medium-term improvements (CSP hardening, SAST, bundle splitting)
- Add 8 long-term items to the roadmap as tracked deferred work

**Non-Goals:**
- Full decomposition of active-chat.tsx (8,743 lines) — tracked as Phase D / roadmap
- React 19 feature adoption — tracked as Phase D / roadmap
- Additional TS strictness flags — tracked as Phase D / roadmap
- Renderer test infrastructure (vitest + testing-library) — tracked as Phase D / roadmap
- Any changes to the auth-env-vars flow (HARD RULE — `applyEnterpriseAuth()` is the only sanctioned injection path)
- LiteLLM Enterprise features (cluster runs OSS only)

## Decisions

### D1: URL allowlist approach for signedFetch/streamFetch

**Decision:** Origin-based allowlist in the IPC handler, not a domain-string check.

**Rationale:** Using `new URL(url).origin` for comparison is protocol-safe (prevents `javascript:`, `data:` URIs) and handles port differences correctly. The allowlist is derived from `getApiUrl()` — the same function that provides the API base URL to the renderer. This means the allowlist automatically adapts to custom `MAIN_VITE_API_URL` configurations.

**Alternative considered:** URL prefix matching (startsWith). Rejected because prefix matching is vulnerable to path-traversal-style attacks (e.g., `https://apollosai.dev.evil.com`).

**Implementation:** Add validation before the `fetch()` call in both `api:signed-fetch` and `api:stream-fetch` handlers in `src/main/windows/main.ts`. Throw an error (not silently drop) so the renderer gets a clear failure signal.

### D2: safeOpenExternal utility pattern

**Decision:** Create `src/main/lib/safe-external.ts` with a `safeOpenExternal()` function that validates URL scheme before delegating to `shell.openExternal()`. Apply at all 6 call sites via find-and-replace.

**Rationale:** Centralizing the validation in a utility follows the credential-store.ts pattern — a single canonical module that all call sites must use. This enables a regression guard similar to `credential-storage-tier.test.ts`.

**Alternative considered:** Inline validation at each call site. Rejected because it creates 6 copies of the same logic and can't be enforced by a regression guard.

**Allowed schemes:** `https:`, `http:`, `mailto:`. No `file:`, `ftp:`, `javascript:`, `data:`, or custom protocol handlers.

### D3: SecurityPolicy promotion is a cross-repo change

**Decision:** The SecurityPolicy promotion (IMM-3) and CiliumNetworkPolicy default-deny (IMM-4) require changes in the cluster repo (`/Users/jason/dev/ai-k8s/talos-ai-cluster/`), not just this repo's `deploy/` manifests.

**Rationale:** The `deploy/` directory contains the Flux kustomization that references these files. Renaming `securitypolicy.draft.yaml` → `securitypolicy.yaml` and updating `kustomization.yaml` happens here, but the SecurityPolicy's OIDC issuer configuration must be verified against the cluster's actual Entra configuration. A self-contained handoff prompt for the cluster agent should be produced during implementation.

### D4: getFlag() cache uses a startup-loaded Map

**Decision:** Load all flag overrides into a `Map<string, string>` at database initialization time. `getFlag()` reads from the Map. `setFlag()` and `clearFlag()` update both the Map and the database.

**Rationale:** The `featureFlagOverrides` table is tiny (< 20 rows). Loading it once at startup eliminates ~1ms per `getFlag()` call. The Map is never stale because all mutation paths go through the same module.

**Alternative considered:** LRU cache with TTL. Rejected as over-engineered for a table with < 20 rows that's only mutated through two functions in the same module.

### D5: FK indexes via Drizzle schema + db:generate

**Decision:** Add `index()` declarations to the Drizzle schema, then run `bun run db:generate` to produce a migration. The existing auto-migration logic applies the index on next app startup.

**Rationale:** This is the standard Drizzle workflow. The `.claude/rules/database.md` rule mandates this approach — never hand-edit generated migrations.

### D6: WebkitAppRegion type augmentation

**Decision:** Create a `src/renderer/types/css.d.ts` module augmentation that extends React's `CSSProperties` interface with `WebkitAppRegion`. Then remove all 41 `@ts-expect-error` comments.

**Rationale:** This eliminates 41 of 42 total `@ts-expect-error` suppressions in one change. The property is a non-standard CSS property used by Electron for window drag regions — it's a legitimate use case that TypeScript's default `lib.dom.d.ts` doesn't cover.

### D7: Audit gate severity gating

**Decision:** Change the CI audit step to fail only on high-severity direct-dependency advisories, not on all advisories (which include 58+ pre-existing transitive dev-dep issues).

**Rationale:** The current `|| true` makes the gate meaningless. Failing on ALL advisories would immediately break CI due to pre-existing transitive advisories. Failing on high-severity direct-dependency advisories is the right middle ground — it catches genuine supply chain issues without false-positive noise.

### D8: Phase ordering

**Decision:** Four phases executed sequentially: A → B → C → D.

- **Phase A** (Immediate): 6 items, all P0 security + CI. Must complete before any production deployment. Estimated 1-2 sessions.
- **Phase B** (Quick Wins): 12 items, all high-impact/low-effort. Can be parallelized. Estimated 1-2 sessions.
- **Phase C** (Medium-term): 12 items, mixed effort. Each item is independently implementable. Estimated 4-6 sessions spread across sprints.
- **Phase D** (Long-term): 8 items tracked as roadmap entries in `docs/operations/roadmap.md`. Not implemented in this change — only tracked.

**Rationale:** Phase A blocks production. Phase B improves daily development experience. Phase C builds on A+B foundations. Phase D is tracked for future planning.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| signedFetch allowlist may break legitimate fetch paths not yet discovered | The allowlist is origin-based against `getApiUrl()`. All existing signedFetch calls in the codebase target this same origin. Add logging (not blocking) for a short period to discover any missed paths before enforcing. |
| safeOpenExternal may break OAuth flows that use custom schemes | OAuth flows in this codebase use `https:` URLs. The MSAL library and upstream OAuth both redirect via `https:` — no custom scheme handlers are used. Verified in validation audit. |
| SecurityPolicy promotion may block traffic if OIDC issuer is misconfigured | Test the SecurityPolicy with `kubectl apply --dry-run=server` against the cluster before merging. The draft file documents the required OIDC configuration. |
| CiliumNetworkPolicy default-deny may break cluster traffic | Audit all legitimate traffic paths before enabling. The existing CiliumNetworkPolicy already has allow rules for expected paths — verify they're complete. |
| FK index migration could be slow on large databases | SQLite index creation is fast even on 100K+ row tables. The app's local database is typically < 10K rows. Auto-migration on startup adds < 100ms. |
| Removing 41 @ts-expect-error may reveal new type errors | The WebkitAppRegion augmentation is a well-known pattern. If tsgo has issues with module augmentation, the 41 suppressions can be restored. |
| claude.ts decomposition (Phase C) may introduce regressions | Phase C decomposition happens after Phase A security fixes and Phase B performance improvements are stable. Each extraction is independently testable. |

## Open Questions

1. **CSP dynamic generation (Phase C):** Should the CSP be set in the HTML meta tag (current) or via Electron's `session.webRequest.onHeadersReceived`? The latter allows runtime configuration based on whether PostHog is enabled.

2. **SAST tool choice (Phase C):** CodeQL (free for public repos on GitHub) vs Semgrep (more configurable, OSS tier available). Need to evaluate which catches Electron-specific patterns better.

3. **authedProcedure scope (Phase C):** Which tRPC procedures should require auth? Candidates: enterprise-only features, credential operations, external shell operations. Local-only operations (file reading, DB queries) may not need auth middleware given the IPC-only transport.

4. **Bundle splitting targets (Phase C):** The 15MB renderer bundle includes Monaco, mermaid, katex, cytoscape, and Shiki. Which should be lazy-loaded vs. eagerly loaded? Monaco is used in the diff view (frequent), mermaid/katex in markdown rendering (frequent), cytoscape in architecture diagrams (rare).
