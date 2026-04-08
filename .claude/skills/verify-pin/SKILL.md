---
name: verify-pin
description: Background knowledge for safely bumping the pinned versions of Claude CLI binary, Codex CLI binary, Electron, Vite, Tailwind, or Shiki in this repo. Each pin is load-bearing for a different reason — this skill encodes the per-pin rationale and the regression test that must pass before the bump can land. Use proactively whenever editing package.json, scripts/download-claude-binary.mjs, scripts/download-codex-binary.mjs, or any file that mentions these versions. Claude-only (background knowledge, not user-invocable).
disable-model-invocation: false
user-invocable: false
---

# Pin Verification Skill

This skill encodes the load-bearing reasons each version pin exists in this repo. Before editing any of the files below, read the relevant pin section. After editing, run the verification command for that pin.

## Why this exists

This repo has 6 different version pins, each pinned for a *specific reason* documented in CLAUDE.md "Environment Notes." Bumping one without re-verifying the constraint that pinned it has bitten the project before. The existing PreToolUse hook in `.claude/settings.json` already emits a warning when binary pin files are touched — this skill is the mental checklist Claude should run through when responding to that warning.

## The 6 pins

### 1. Claude CLI binary — pinned `2.1.96`

**File**: `package.json` (`claude:download` script), `scripts/download-claude-binary.mjs`

**Why pinned**: Claude binary releases occasionally break session resume and streaming behavior. The pin protects the `@anthropic-ai/claude-agent-sdk` integration in `src/main/lib/trpc/routers/claude.ts`.

**Additional constraint**: Must be **2.1.89 or newer** because GPG signature verification (Phase 0 gate #7) is only available from that version onward. The download script enforces signature verification — bumping below 2.1.89 will break the download flow.

**Before bumping**:
1. Read the new version's release notes for any breaking changes to `claude-code` CLI session resume, streaming, or token format
2. Verify the new version still publishes a signed `manifest.json` to GCS
3. Confirm the SHA-256 in the manifest matches what will be downloaded
4. Run a manual session resume test in dev mode

**After bumping**:
- Update CLAUDE.md "Environment Notes" line that says `Claude CLI binary pinned to 2.1.96`
- Update README.md install instructions
- Update CONTRIBUTING.md if it mentions the pin
- Run `bun run claude:download` to verify the download + GPG verification still works
- Run `bun test` (regression guards include `gpg-verification-present.test.ts`)

### 2. Codex CLI binary — pinned `0.118.0`

**File**: `package.json` (`codex:download` script), `scripts/download-codex-binary.mjs`

**Why pinned**: The Codex CLI is bridged into the app via `@zed-industries/codex-acp` (currently `0.9.3`). Bumping the Codex version requires re-testing that bridge.

**Additional constraint**: Must be **0.118.0 or newer** because dynamic short-lived bearer token refresh for custom model providers was added in that version. This is what enables the Phase 1 Envoy Gateway rotation pattern without a custom shim.

**Before bumping**:
1. Read the Codex release notes for any changes to the ACP protocol
2. Verify the new version still natively supports dynamic bearer token refresh
3. Check that `@zed-industries/codex-acp` has a compatible version
4. Verify the GitHub release publishes an `asset.digest` with SHA-256

**After bumping**:
- Update CLAUDE.md, README.md, CONTRIBUTING.md
- Run `bun run codex:download`
- Manually test a Codex chat in dev mode

### 3. Electron — pinned `~39.x` (currently 39.8.7)

**File**: `package.json` `devDependencies.electron`

**Why pinned**: 
- Electron 39 is the last version compatible with the current `node-pty`, `better-sqlite3`, and `electron-rebuild` toolchain configuration
- Vite 6 (also pinned, see #4) depends on Electron 39+ for `splitVendorChunk`

**Additional constraint**: **EOL is 2026-05-05.** Plan upgrade to Electron 40+ before that date. After EOL, security patches stop.

**Before bumping** (within 39.x):
1. Read the patch notes — patch versions should be safe
2. Verify `electron-rebuild` still works for `better-sqlite3` and `node-pty`

**Before bumping to 40.x or later**:
1. This is a coordinated upgrade — do not do it as a one-off pin bump
2. Test all native modules rebuild
3. Test protocol handlers register correctly (`apollosai-agents://` and `apollosai-agents-dev://`)
4. Test auto-update flow with a dev build
5. Update CLAUDE.md EOL date

### 4. Vite — pinned `^6.4.2` (must stay 6.x)

**File**: `package.json` `devDependencies.vite`

**Why pinned**: `electron-vite` 3.x depends on `splitVendorChunk` which was **removed in Vite 7+**. Bumping to Vite 7 will break the build immediately.

**The hook will already catch this**: The PostToolUse hook for `electron.vite.config.ts` runs `bun run build` on edit. Trust it.

**Before bumping** (within 6.x):
1. Read the patch notes
2. Run `bun run build` — the hook will do this for you on `electron.vite.config.ts` edits

**Before bumping to 7.x or later**: Don't, until `electron-vite` is upgraded to a version that no longer uses `splitVendorChunk`. Track upstream `alex8088/electron-vite` releases.

### 5. Tailwind CSS — pinned `~3.x` (must stay 3.x)

**File**: `package.json` `devDependencies.tailwindcss`

**Why pinned**: `tailwind-merge` v3 requires Tailwind v4. Upgrading Tailwind requires migrating the v3 config, regenerating PostCSS config, and re-validating every `cn()` call site (134+ files use it).

**Before bumping**: This is a multi-day migration, not a pin bump. Open an OpenSpec proposal first.

### 6. Shiki — pinned `^3.0.0` (must stay 3.x)

**File**: `package.json` `dependencies.shiki`

**Why pinned**: `@pierre/diffs` pins `shiki: ^3.0.0`. Until upstream `@pierre/diffs` releases a v4-compatible version, Shiki must stay on 3.x.

**Before bumping**: Check if `@pierre/diffs` has released a new version supporting Shiki 4+. If not, do not bump.

## Mental checklist when editing any pin file

1. **What does this pin protect?** — Read the relevant section above
2. **Is the new version compatible with the constraint?** — Don't just bump for "latest"
3. **Are there other docs that mention this pin?** — `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `.serena/memories/environment_and_gotchas.md`. The `docs-drift-check` skill exists to catch missed updates.
4. **Does a regression guard need to be updated?** — `tests/regression/feature-flags-shape.test.ts` and `tests/regression/gpg-verification-present.test.ts` both have version-coupled assertions
5. **Will the change appear in the diff?** — Confirm with `git diff package.json` before staging
6. **Did I run the verification command for the pin I touched?** — See the "After bumping" sections

## What NOT to do

- **Do not run `bun update --latest`** without checking each major bump against this skill
- **Do not bump pins to "fix" a CI failure** — investigate the root cause first
- **Do not bump multiple pins in the same commit** unless they're a coordinated upgrade (e.g., Electron + native modules)
- **Do not skip regenerating `bun.lock`** after a pin change
- **Do not trust the existing PreToolUse warning as sufficient** — the warning is a *prompt* to think, not a verification
