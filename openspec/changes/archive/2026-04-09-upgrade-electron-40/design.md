## Context

Electron 39.8.7 (Node 22, Chromium 142) reaches EOL on 2026-05-05. The upgrade to Electron 40 (Node 24, Chromium 144) is a coordinated multi-dependency bump that touches the build toolchain, native module compilation, and release pipeline.

**Current state:**
- `electron: ~39.8.7`, `electron-vite: 3.1.0`, `vite: ^6.4.2`, `electron-builder: 25.1.8`
- Native modules: `better-sqlite3@12.8.0`, `node-pty@1.1.0` — both require `electron-rebuild` per platform
- electron-vite 3.x re-exports `splitVendorChunk` from Vite, which was removed in Vite 7. Our config does NOT use it directly, but the re-export definition causes import failures with Vite 7.
- electron-vite 5.0.0 is available: drops the re-export, deprecates `externalizeDepsPlugin` in favor of `build.externalizeDeps`, adds `@swc/core` peer dep, supports Vite 5/6/7

**Constraint:** The upgrade must not change any user-facing behavior, database schema, tRPC API surface, or AI backend integration. This is a pure infrastructure change.

## Goals / Non-Goals

**Goals:**
- Upgrade Electron to a supported version before the 2026-05-05 EOL deadline
- Upgrade the build toolchain (electron-vite, electron-builder) to versions compatible with Electron 40
- Verify all native modules compile and function correctly against Node 24
- Maintain all existing platform support (macOS arm64/x64, Windows, Linux)
- Keep the upgrade conservative — minimize scope to only what's required

**Non-Goals:**
- Upgrading Vite from 6.x to 7.x (electron-vite 5.x supports both; defer Vite 7 to a follow-up)
- Upgrading Tailwind from 3.x to 4.x (separate constraint, unrelated to Electron)
- Upgrading shiki from 3.x to 4.x (separate constraint, unrelated to Electron)
- Adding new features or changing application behavior
- Resolving pre-existing TypeScript baseline errors (87 errors, unrelated)

## Decisions

### D1: Target Electron 40.x (not 41.x)

**Choice:** Upgrade to Electron 40 (latest patch), not Electron 41.

**Rationale:** Electron 40 is the minimum jump needed to get off EOL. Electron 41 introduces Chromium 146 and Node 24.14 — a larger delta with more potential for breakage. We can upgrade to 41 later from a stable 40 base.

**Alternative rejected:** Skip to 41 — higher risk, no additional benefit for the EOL deadline.

### D2: electron-vite 3.1.0 → 5.0.0

**Choice:** Upgrade electron-vite to 5.0.0 (skipping 4.0.1).

**Rationale:** electron-vite 5.0.0 supports Vite 5/6/7 and drops the `splitVendorChunk` re-export that blocks Vite 7. It's the latest stable release and maintains our Vite 6.x pin. The 4.0.1 release was short-lived and 5.0.0 is the recommended target.

**Migration impact:** electron-vite 5.0 adds `@swc/core` as a peer dep. The key breaking change is that `externalizeDepsPlugin` is **deprecated** in 5.0 and replaced by the `build.externalizeDeps` config option in `electron.vite.config.ts`. The `defineConfig` API is unchanged. Migration: remove the `externalizeDepsPlugin()` import and call, add `build: { externalizeDeps: true }` (or equivalent) to main/preload configs.

**Alternative rejected:** Stay on electron-vite 3.1.0 — would work with Electron 40 only if Vite stays on 6.x (which it does), but leaves us on a version that can't upgrade to Vite 7 in the future. Also rejected: 4.0.1 — superseded by 5.0.0 which has the same Vite 6 compatibility plus cleaner config API.

### D3: Keep Vite on 6.x

**Choice:** Do not upgrade Vite as part of this change.

**Rationale:** electron-vite 5.0.0 supports Vite 6.x. Upgrading Vite 6→7 introduces `splitVendorChunk` removal risk and Tailwind/shiki compatibility concerns. The safest path is one major change at a time.

**Alternative rejected:** Upgrade to Vite 7 simultaneously — too many moving parts; defer to a follow-up change.

### D4: electron-builder 25.x → 26.x (with 25.x fallback)

**Choice:** Upgrade electron-builder to latest 26.x, but fall back to 25.x latest patch if packaging breaks.

**Rationale:** electron-builder 26.x includes explicit Electron 40 support, updated `@electron/rebuild` transitive deps, and bug fixes. However, 26.x has **stability regressions** reported by the community (notarization failures, code signing issues on some configurations). The plan is to test 26.x first — if `bun run package:mac` succeeds and notarization passes, keep 26.x. If packaging or signing breaks, fall back to `bun add -d electron-builder@25` (latest 25.x patch), which may still work with Electron 40 even without explicit support.

### D5: node-pty mitigation strategy (requires lazy import pre-work)

**Choice:** Attempt rebuild of node-pty 1.1.0 against Node 24. If it fails, test latest node-pty version. If all fail, the terminal feature degrades gracefully (the rest of the app works without it).

**Pre-work required:** Before attempting the Electron bump, refactor `src/main/lib/terminal/session.ts` to use a dynamic `import()` for node-pty wrapped in try/catch, exposing a `ptyAvailable` flag. Make `chats.ts` terminalManager calls nil-safe. Currently node-pty is eagerly imported, which means a failed native module load crashes the entire main process at startup — the feature flag fallback is useless without lazy loading.

**Rationale:** node-pty's Node 24 support is incomplete upstream. We build macOS-only for now (enterprise deployment), and macOS compilation from source typically works even without prebuilt binaries. Windows support is a future concern.

**Fallback:** If node-pty cannot be made to work, the terminal integration is non-critical for the core AI chat workflow. We can temporarily disable the terminal feature behind a feature flag until upstream publishes Node 24 binaries.

### D6: Upgrade ordering — sequential with atomic upgrade phase

**Choice:** Apply dependency upgrades in this strict order:
1. `@swc/core` (new peer dep for electron-vite 5) — independent, can be verified alone
2. `electron-vite` 3→5 + `electron-builder` 25→26 + `electron` 39→40.8.0 — **atomic upgrade phase**, tested together (these three are tightly coupled; testing them independently gives false confidence since electron-vite 5 config changes and electron-builder 26 packaging changes only manifest under the new Electron)
3. Run `postinstall` (electron-rebuild)
4. Verify `bun run build` + `bun test`
5. Verify `bun run dev` (smoke test)

**Rationale:** Step 1 is independently rollbackable. Steps 2-4 of the old plan (electron-vite, electron-builder, electron) are an atomic upgrade phase — they cannot be meaningfully tested in isolation because the build toolchain changes only matter under the target Electron version. If the atomic phase breaks, bisect within it by reverting individual deps.

## Risks / Trade-offs

**[node-pty + Node 24]** → Mitigation: Test compile from source on macOS; if fails, gate terminal behind feature flag. Monitor upstream for prebuilt binaries.

**[electron-vite 5.0 API changes]** → Mitigation: `externalizeDepsPlugin` is deprecated in 5.0 — migrate `electron.vite.config.ts` to use `build.externalizeDeps` config option. `defineConfig` API is unchanged. Adapt the config as part of the atomic upgrade phase.

**[electron-builder 26.x config changes]** → Mitigation: Run `bun run package:mac` immediately after upgrade to verify packaging. Check notarization with `xcrun notarytool`.

**[@sentry/electron compatibility]** → Mitigation: Check `@sentry/electron` changelog for Electron 40 support. If incompatible, temporarily disable Sentry (it's opt-in via env var).

**[Chromium 144 web API changes]** → Mitigation: Low risk — the renderer uses standard React/DOM APIs. Run `bun run dev` and visually verify the UI renders correctly.

**[safeStorage backward compatibility]** → Risk: Credentials encrypted under Electron 39's safeStorage (Chromium 142 encryption backend) must still decrypt correctly under Electron 40 (Chromium 144). If the underlying OS keychain integration changed, existing users' stored OAuth tokens in `anthropic_accounts` and `claude_code_credentials` would be unreadable, forcing re-authentication. Mitigation: Encrypt a test string under E39, upgrade, verify decryption under E40 before merging.

## Migration Plan

### Execution

1. Create a feature branch `feat/upgrade-electron-40`
2. Apply dependency upgrades in D6 order
3. Run all quality gates: `bun run ts:check`, `bun run build`, `bun test`, `bun audit`
4. Run `bun run dev` with `MAIN_VITE_DEV_BYPASS_AUTH=true` and smoke test
5. Run `bun run package:mac` to verify packaging
6. If packaging succeeds, test notarization
7. Merge to main

### Rollback

If the upgrade breaks in a way that can't be fixed before EOL:
- Revert the version bump commit
- Stay on Electron 39.8.7 past EOL temporarily (undesirable but not catastrophic for internal deployment)
- **Note:** The enterprise deployment is behind Envoy Gateway, but this only mitigates server-side network attack vectors. Envoy Gateway does **not** mitigate client-side Chromium/V8 CVEs (renderer exploits, sandbox escapes, V8 JIT bugs) — these are the primary risk of running an EOL Electron. The rollback is a stop-gap, not a permanent mitigation.

## Open Questions

1. **How does the electron-vite 5.0.0 `externalizeDepsPlugin` → `build.externalizeDeps` migration work in practice?** — The plugin is deprecated but may still function. Needs verification: test both the deprecated plugin path and the new config option to confirm `electron.vite.config.ts` migration is clean.
2. **What's the latest node-pty version, and does it support Node 24?** — Check npm for v1.2+ releases.
3. **Does @sentry/electron 7.11.0 support Electron 40?** — Check Sentry's compatibility matrix.
4. **Does the `scripts/patch-electron-dev.mjs` Info.plist patching work with Electron 40's macOS bundle?** — Verify the bundle structure hasn't changed.
5. **Should Electron Fuses be enabled as part of this upgrade?** — Fuses (`@electron/fuses`) allow compile-time toggling of Electron features like `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments`. Disabling these hardens the packaged app against local privilege escalation. This may be out of scope for the version bump itself but should be tracked as a fast follow-up.
