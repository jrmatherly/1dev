## Context

`bun run dev` on macOS triggers two Keychain prompts on every launch (`1code-desktop Safe Storage` / `Key`). Root cause validated by multi-reviewer audit (architect / security / code / DX) and direct code inspection:

- The dev Electron binary at `node_modules/electron/dist/Electron.app` is either unsigned or ad-hoc signed, and is mutated on every `bun install` by `scripts/patch-electron-dev.mjs` (Info.plist edits + icon swap). macOS Keychain binds ACL decisions to the binary's designated requirement (code-signature identity), so "Always Allow" cannot persist against a shifting identity.
- Two prompts, not one, because macOS issues two distinct ACL decisions for the first `safeStorage.decryptString()` call per code identity: "use confidential information" (unlock the master key) and "access key" (read the specific entry).
- Credentials continue to be encrypted via Electron `safeStorage` Tier 1 (macOS Keychain) throughout — see `src/main/lib/credential-store.ts`. The prompt frequency is purely a code-identity problem, not an encryption problem.
- `AuthManager` in enterprise mode (current `.env` has `MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true`) skips the legacy `AuthStore` (`src/main/auth-manager.ts:118`). The actual trigger path is post-boot tRPC queries (`claudeCode.getToken`, `anthropicAccounts.list`, `claude.chat` history) that call `decryptCredential()`.

Production builds signed by `electron-builder` via `APPLE_IDENTITY` (`electron-builder.yml:5`) do **not** have this problem — signed release binaries have stable designated requirements, so Keychain ACL decisions persist. The issue is strictly local-dev.

Full audit in `.scratchpad/2026-04-13-improve-dev-launch-keychain-ux-audit.md` (ephemeral, gitignored per `.claude/rules/scratchpad.md`). Supporting findings in `.scratchpad/2026-04-13-dev-launch-keychain-prompts-findings.md`.

## Goals / Non-Goals

**Goals:**

- Give developers a documented, validated path to eliminate the Keychain prompts using only free Apple tooling.
- Keep `docs/` as the canonical home for the instructions (per `openspec/specs/documentation-site/spec.md`).
- Close the discoverability gap: when a developer hits the prompts, a breadcrumb from `CLAUDE.md` must lead them to the mitigation page.
- Capture deferred work (Option C lazy decryption; future-automation revisit) in `docs/operations/roadmap.md` rather than commit messages or code comments (per `.claude/rules/roadmap.md`).
- Preserve the option to automate later by recording the rationale for NOT automating today.

**Non-Goals:**

- Automating the signing step. Rationale in §Decisions.
- Changing credential storage behavior or encryption tier.
- Modifying any `src/` code, `scripts/` tooling, `package.json`, tests, or regression guards.
- Notarizing the dev binary (Personal Team certs cannot notarize; not required for local use).
- Fixing the production signing pipeline (`electron-builder` + `APPLE_IDENTITY` already handles it).
- Eliminating the **first-ever** prompt after signing. Signing lets "Always Allow" stick; it does not skip the initial dialog.

## Decisions

### D1. Docs-only, no automation

**Choice:** Ship the mitigation as a one-time manual developer-setup guide at a new `docs/operations/dev-setup-macos.md`. Do not add `scripts/sign-dev-electron.mjs` or wire anything into `package.json` postinstall.

**Alternatives considered:**
- **Automated postinstall script** (original design, `.scratchpad/2026-04-13-improve-dev-launch-keychain-ux-design.md`). Rejected after multi-reviewer audit:
  - Code reviewer identified five correctness fixes before the sample script could ship: narrow identity regex (rejected paid "Developer ID Application"), missing SHA-1 fingerprint pinning (stale cert after renewal), missing `isNaN` guard on cert expiry parse, missing `--preserve-metadata=entitlements,requirements` (wipes V8 JIT entitlements, subtle dev crash risk), and `--deep` deprecated since macOS 11.
  - Architect flagged hard-coded `ELECTRON_APP` path duplication across three scripts (DRY violation, coupling to Electron's internal bundle layout) and the lack of any regression guard on postinstall ordering.
  - DX reviewer noted the automation value is bounded anyway: Apple's web portal is **not** available to free-tier accounts — cert creation requires Xcode interactively. Certificate renewal (1 year; auto-renews on next Xcode open) already requires opening Xcode. Automation can neither create nor renew; it can only run `codesign` against an already-created cert.
  - Security reviewer confirmed no rule violations in the original script, but flagged a low-sensitivity PII leak (TeamID logged verbatim to CI/scrollback) that the docs-only variant avoids entirely.
- **Extend `MAIN_VITE_DEV_BYPASS_AUTH` to suppress credential decryption.** Rejected per audit — conflicts with `verify-strategy-compliance` skill; forces dev paths to diverge from production.
- **Swap `safeStorage` for another keystore.** Rejected — violates `.claude/rules/credential-storage.md`.
- **In-memory-only credential mode in dev.** Rejected — forces re-login every session; high effort; masks bugs.

### D2. Standalone page, not a subsection of `env-gotchas.md`

**Choice:** Create `docs/operations/dev-setup-macos.md` as a new page alongside `env-gotchas.md`, and add it to the xyd-js sidebar.

**Alternatives considered:**
- Append a subsection to `docs/operations/env-gotchas.md`. Rejected after DX reviewer noted `env-gotchas.md` is CI-focused (Trivy, Cosign, NSIS, macOS-15 runner RAM, etc.) and an interactive dev-setup guide is visually misplaced there. Per reviewer-recommended Option Y in audit §4.1, a standalone page also seeds future macOS dev-setup topics (Rosetta, keytar arm64 rebuild steps currently scattered across CLAUDE.md and commit notes).

### D3. Include a vetted `codesign` command verbatim, not a link-out

**Choice:** The docs page includes the exact `codesign --force --deep --sign <identity> --timestamp=none --preserve-metadata=entitlements,requirements <Electron.app>` command as a copy-paste step.

**Alternatives considered:**
- Link-out only ("see Apple docs for codesign usage"). Rejected because:
  - The correct flag combination is non-obvious. Three of the five reviewer-identified code issues in the original script were about subtle codesign flag choices (`--preserve-metadata`, `--deep` deprecation, `--timestamp=none` rationale).
  - Audience is technical developers; they will Google if we don't tell them. A vetted command in our docs is strictly safer than letting adopters paste variants from Stack Overflow.
  - The command text is stable — Apple changes codesign infrequently, and the docs page survives in version control.

The page also includes a prominent "**Alternative: live with the prompts**" opt-out subsection so that adopting the signing path remains entirely optional.

### D4. Correct 1-year cert cadence (fix factual error from initial design)

**Choice:** The docs reflect that "Apple Development" certificates issued to free Personal Team accounts are valid for **1 year** and auto-renew when Xcode is opened after expiry. The 7-day expiry mentioned in the original design (`.scratchpad/2026-04-13-improve-dev-launch-keychain-ux-design.md`) applies to provisioning profiles for iOS on-device testing, not to the Mac code-signing certificate. Confirmed via `developer.apple.com`.

### D5. Discoverability via a single `CLAUDE.md` line

**Choice:** Add one line to `CLAUDE.md` "Dev environment quick reference" section pointing at the new docs page.

**Alternatives considered:**
- Log a hint from the main process on first launch. Rejected — crosses into `src/` territory and adds an Electron main-process side effect for what is a docs problem. The DX reviewer flagged this as feature creep.
- README-only pointer. Rejected — `CLAUDE.md` is the authoritative entry point per this repo's conventions (CLAUDE.md identity section + `.claude/rules/README.md`).

### D6. OpenSpec scoping — no capability specs touched

**Choice:** This change adds zero new requirements to any of the 15 capability specs and modifies zero existing requirements. No `specs/<capability>/spec.md` files are created.

**Rationale:**
- `openspec/specs/documentation-site/spec.md` already mandates `docs/` as the canonical home — this change exercises the existing rule correctly and adds no new behavior.
- Per `.claude/rules/openspec.md`, OpenSpec proposals without capability-spec changes are permitted. The change is still routed through OpenSpec for reviewable artifacts + traceability.
- The `specs/` artifact file for this change is an empty placeholder declaring "No capability changes" (see `specs/README.md`).

### D7. Deferred work → roadmap, not commit message

**Choice:** Option C (lazy credential decryption) and the future-automation-revisit both land in `docs/operations/roadmap.md` per `.claude/rules/roadmap.md`.

**Rationale:** These items have real future value but are out of scope here. Putting them anywhere else — CLAUDE.md, a commit message, code comments — loses them. The roadmap is the single source of truth.

## Risks / Trade-offs

- **[Risk] Developer follows the docs but still sees prompts after "Always Allow".** → Mitigation: include a Troubleshooting subsection with the `security delete-generic-password -s "1code-desktop Safe Storage"` ACL-reset command. The most common user error is clicking "Allow" instead of "Always Allow".
- **[Risk] `bun install` re-invalidates the signature via `patch-electron-dev.mjs`.** → Mitigation: documented explicitly in the Troubleshooting subsection. Re-running the `codesign` command after `bun install` is a one-liner; developers can alias it.
- **[Risk] Apple changes Xcode's cert-creation flow or wording.** → Mitigation: link to Apple's canonical KB articles rather than paraphrasing every screen. The docs page has sections that name features, not UI strings, so Apple UI rewording is low-risk.
- **[Risk] Developer has multiple "Apple Development" certificates (e.g., multi-Apple-ID workstation) and signs with the wrong one.** → Mitigation: documented via `security find-identity -v -p codesigning` and "pass the exact name including TeamID" guidance in the Troubleshooting subsection.
- **[Risk] Developer with no Apple ID cannot use the mitigation at all.** → Mitigation: the page has an "Alternative: live with the prompts" opt-out path stating clearly that the app works fine without signing. Credentials remain encrypted regardless.
- **[Risk] Future team members re-propose automation without context.** → Mitigation: the "Why we don't automate this" callout in the docs page documents the five reviewer-identified code issues and the cert-portal limitation, so the next proposer starts from the audit rather than repeating it. The P3 roadmap entry also records the triggers that would justify a revisit (≥ 3 contributors, cross-project helper available).
- **[Trade-off] No automated verification that the mitigation still works after an Electron version bump.** The `--preserve-metadata` entitlements list, `--deep` deprecation status, and `codesign` flag availability are all Apple-controlled. A future Electron bump could in theory require different flags. → Mitigation: the docs page is small and reviewable; a quarterly `verify-pin` pass or any `/session-sync` after a Claude-CLI/Electron pin bump is the natural time to spot-check.

## Migration Plan

This change has no runtime behavior to migrate — pure documentation. Rollout is:

1. Merge the docs page, CLAUDE.md link, and roadmap entries in a single PR.
2. Existing developer machines are unaffected until each developer chooses to follow the new setup. No forced migration, no backward-incompatible breakage.
3. Rollback is trivial: revert the PR. No data to clean up; no Keychain entries touched by this change.

## Open Questions

- **Q1.** Should `docs/operations/dev-setup-macos.md` become the seed for other macOS-dev topics (Rosetta notes, keytar arm64 rebuild instructions currently buried in CLAUDE.md, `electron-rebuild` quirks)? **Proposal:** yes, but out of scope for this change. Track as a P3 roadmap "consolidate macOS dev-setup gotchas" entry if/when a second topic materializes.
- **Q2.** Should the "Alternative: live with the prompts" subsection be more visible (e.g., called out at the top of the page) to make the opt-out path obvious? **Proposal:** include it in the intro so a developer skimming the page sees the opt-out without scrolling, and repeat it as a subsection at the end.
