## Context

The chosen enterprise auth strategy (docs/enterprise/auth-strategy.md v2.1, empirically validated 2026-04-08) uses an Envoy Gateway dual-auth pattern: browser users get OIDC cookie auth, CLI subprocesses pass a Bearer token acquired via MSAL Node. The `credential-store.ts` module (Phase 0.5) provides the tiered encryption foundation.

This change adds the MSAL Node library and two new modules — `enterprise-auth.ts` (token acquisition) and `enterprise-store.ts` (token cache persistence) — as **isolated, unwired** code. Auth strategy §5.3.1 Step A explicitly mandates this isolation: "Add as new files, NOT yet wired to anything."

The Entra app registration is a cluster-side prerequisite (change #4) — for development and testing, the existing smoke-test app registration (`f505346f` tenant) can be reused.

## Goals / Non-Goals

**Goals:**
- Install `@azure/msal-node` v5, `@azure/msal-node-extensions`, and `jose` v5
- Create `enterprise-auth.ts` with MSAL `PublicClientApplication` configuration
- Create `enterprise-store.ts` implementing `ICachePlugin` with tier-aware persistence
- Create `enterprise-types.ts` with shared type definitions
- Add unit tests for config construction, cache plugin behavior, and export verification
- Regression guard ensuring the module remains unwired (not imported by auth-manager.ts)

**Non-Goals:**
- Wiring into `auth-manager.ts` (change #2: `wire-enterprise-auth`)
- Modifying `buildClaudeEnv()` or `applyEnterpriseAuth()` (change #2)
- Any renderer/UI changes (change #3: `add-litellm-settings-ui`)
- Cluster SecurityPolicy, CiliumNetworkPolicy, or LiteLLM configmap (change #4)
- CAE claims challenge handler (separate future concern)
- Actually performing Entra sign-in (requires cluster + wiring)

## Decisions

### Decision 1: MSAL PublicClientApplication vs ConfidentialClientApplication

**Chosen: `PublicClientApplication`**

Desktop Electron apps are "public clients" — they cannot securely store a client secret. MSAL Node's `PublicClientApplication` handles the authorization code flow with PKCE automatically when `acquireTokenInteractive` is called with a loopback redirect. The auth strategy §5.1 confirms: "Token acquisition only" — MSAL handles the full OAuth dance internally, we just call `acquireTokenInteractive()` and get a token back.

**Alternative considered:** `ConfidentialClientApplication` with a client secret embedded in the app binary. Rejected — trivially extractable from ASAR, violates OAuth best practices for native apps (RFC 8252 §8.5).

### Decision 2: Token cache persistence via msal-node-extensions

**Chosen: `@azure/msal-node-extensions` with tier-aware gating**

Microsoft's official cache persistence library uses platform-native keystores (DPAPI on Windows, Keychain on macOS, libsecret on Linux). This aligns exactly with `credential-store.ts`'s Tier 1 backends.

The `enterprise-store.ts` module will:
- **Tier 1:** Use `@azure/msal-node-extensions` `PersistenceCreator` with platform-native encryption
- **Tier 2 (basic_text):** Use `PersistenceCreator` with file-based fallback + log warning (MSAL extensions already have file fallback)
- **Tier 3:** Use MSAL's in-memory cache only (no persistence). Tokens survive the session but not app restart. Log error at startup.
- **Enterprise flag override:** When `credentialStorageRequireEncryption` is true and tier is 2, fall back to in-memory (same as Tier 3)

**Alternative considered:** Rolling our own cache plugin using `credential-store.ts` directly. Rejected — `msal-node-extensions` handles the complex MSAL cache serialization format, key rotation, and atomic writes. We'd be re-implementing Microsoft's work.

### Decision 3: Entra configuration source

**Chosen: Environment variables + hardcoded fallback defaults**

The MSAL config requires `clientId` and `tenantId`. These should be configurable for different deployments:

```typescript
const config: EnterpriseAuthConfig = {
  clientId: process.env.ENTRA_CLIENT_ID ?? FLAG_DEFAULTS_DEFINED_ELSEWHERE,
  tenantId: process.env.ENTRA_TENANT_ID ?? 'f505346f-75cf-458b-baeb-10708d41967d', // org default
  authority: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  redirectUri: 'http://localhost', // MSAL loopback redirect
};
```

In Phase 1 change #3 (UI), these will become user-configurable via the settings page. For now, environment variables are sufficient for development and testing.

### Decision 4: jose v5 for JWT inspection

**Chosen: Install `jose` v5 for local JWT decoding/validation**

The app needs to inspect token claims locally (display user info, check expiry, extract `oid`/`tid` for logging) without calling a network endpoint. `jose` is the standard library for this — it's already used by the MSAL ecosystem and has zero native dependencies.

This is NOT used for token validation (Envoy Gateway does that). It's used for **claim extraction** only — reading the decoded payload to populate `EnterpriseUser`.

### Decision 5: Module isolation enforcement

**Chosen: Regression guard that BLOCKS wiring**

The regression guard will assert that `auth-manager.ts` does NOT import from `enterprise-auth.ts`. This enforces the Step A isolation boundary from the auth strategy. The guard will be intentionally REMOVED in change #2 when we wire the modules together.

## Risks / Trade-offs

**[Risk: `msal-node-extensions` native module compatibility with Electron 39]** → Mitigated: `electron-rebuild` handles native addon compilation. `msal-node-extensions` uses N-API (stable ABI), not raw V8 APIs. If rebuild fails, the module falls back to file-based persistence (same as Tier 2).

**[Risk: `msal-node-extensions` version mismatch with `msal-node`]** → The two packages are released in lockstep by Microsoft's identity team. Pin them to the same major version (both v5.x) and use `bun audit` to catch drift.

**[Risk: Oversized dependency footprint]** → `@azure/msal-node` is ~500KB, `msal-node-extensions` is ~100KB, `jose` is ~200KB. Reasonable for the functionality provided. All three are tree-shakeable.

**[Trade-off: No actual sign-in possible yet]** → By design. The modules export functions that can be called, but nothing in the app calls them until change #2 wires them in. This keeps the blast radius zero — if MSAL has unexpected Electron compatibility issues, we discover them in unit tests before they affect any user-facing flow.

**[Trade-off: Entra config via env vars, not UI]** → Temporary. Change #3 adds the settings UI. Env vars are sufficient for development/testing in the meantime.
