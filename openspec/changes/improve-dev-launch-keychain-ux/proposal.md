## Why

On macOS, `bun run dev` surfaces two Keychain prompts on every launch — "1Code wants to use your confidential information…" and "1Code wants to access key…" — and `Always Allow` does not persist across launches. Root cause: the unsigned dev Electron binary (`node_modules/electron/dist/Electron.app`) has no stable code-signature identity, so macOS Keychain cannot bind its ACL decisions across `bun install` rebuilds. This is a daily friction point for macOS developers working on this fork. A one-time, manual Apple ID + Xcode setup eliminates the prompts permanently; attempting to automate the setup in `postinstall` introduces more cost than benefit (cert creation is Xcode-only and cannot be scripted, Electron path coupling is fragile, and a multi-reviewer audit identified five code-correctness fixes required before any such script could ship). Documenting the manual mitigation is the lowest-risk, highest-value path.

## What Changes

- **Add** a new standalone page `docs/operations/dev-setup-macos.md` with:
  - Symptom + root-cause explanation of the Keychain prompts
  - "Why we don't automate this" rationale (preempts future "why isn't this in postinstall?" questions)
  - Step-by-step setup: install full Xcode (not CLI Tools), create a free Apple ID "Personal Team" Apple Development certificate, run a vetted `codesign --force --deep --sign <identity> --timestamp=none --preserve-metadata=entitlements,requirements <Electron.app>` command
  - Troubleshooting subsection (`security delete-generic-password` reset, multiple-identity disambiguation, post-`bun install` re-sign note)
  - Renewal note (cert is valid 1 year; Xcode auto-renews on next open)
  - "Alternative: live with the prompts" opt-out subsection (the app works fine without signing)
  - Official Apple KB links (no third-party references)
- **Add** one line to `CLAUDE.md` "Dev environment quick reference" section pointing to the new docs page (closes the discoverability gap identified by the DX reviewer — this is the only moment-of-pain breadcrumb).
- **Add** a P2 deferred roadmap entry in `docs/operations/roadmap.md` for **Option C — lazy credential decryption** (defers credential-requiring tRPC queries until the user opens a chat; improves first-launch UX in production regardless of local signing).
- **Add** a P3 deferred roadmap entry for **future automation-revisit** — to be reconsidered if (a) more contributors join the fork or (b) an existing cross-project Electron-dev-sign helper emerges.
- **Add** `docs/operations/dev-setup-macos.md` to the xyd-js navigation sidebar (`docs/docs.json` under the Operations tab).

**No** `src/` changes. **No** `scripts/` additions. **No** `package.json` postinstall changes. **No** tests. **No** capability spec changes. **No** deps added.

## Capabilities

### New Capabilities

_None._ This change introduces no new capability spec file.

### Modified Capabilities

- `documentation-site`: **ADDED** a new requirement formalizing the rule that developer-workstation setup guides (platform-specific, interactive-setup topics like this change's Keychain mitigation) live on dedicated pages under `docs/operations/dev-setup-<platform>.md`, are registered in the xyd-js sidebar via `docs/docs.json`, follow a required section structure (Overview, Symptom, Setup, Troubleshooting, Official references, opt-out), and cite first-party vendor docs only. The rule is codified in `specs/documentation-site/spec.md` under this change and makes the dev-setup-macos page the first concrete instance. Captures the separation-of-concerns rationale from the multi-reviewer audit so future contributors do not reappend dev-setup topics to CI-focused pages.

## Impact

- **Docs:** new page at `docs/operations/dev-setup-macos.md`, nav entry in `docs/docs.json`, link added to `CLAUDE.md`, two new entries in `docs/operations/roadmap.md`.
- **Code:** none.
- **tRPC routers:** none.
- **Database tables:** none.
- **Scripts / build:** none.
- **Tests / regression guards:** none (docs-only; no new behavior to guard).
- **Quality gates:** only the `docs-build` gate (`cd docs && bun run build`) is materially exercised. `ts:check`, `build`, `test`, `audit` unaffected.
- **Upstream boundary (F1-F10):** no interaction. This change does not touch `remoteTrpc.*` or any upstream-dependent code.
- **Phase 0 hard gates:** this change does not advance any Phase 0 gate (all 15/15 are already complete).
- **Security posture:** unchanged. Credentials continue to be encrypted via `safeStorage` Tier 1 (macOS Keychain). The signing recommendation does not change the encryption algorithm, key storage location, or tier. Verified by multi-reviewer audit against `.claude/rules/auth-env-vars.md` and `.claude/rules/credential-storage.md` (neither rule triggered).
