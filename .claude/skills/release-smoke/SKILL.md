---
name: release-smoke
description: Post-release smoke checklist across the 3-OS matrix (macOS arm64+x64, Linux, Windows). Covers artifact download, Gatekeeper/SmartScreen/AppImage launch checks, auto-update test, notarization verification, and Trivy+Cosign container verification. Run against a draft GitHub Release BEFORE promoting to published. Must be invoked manually by the user — not auto-triggerable.
disable-model-invocation: true
---

# Release Smoke Test Checklist

Run this skill against a **draft** GitHub Release before promoting to published. The release workflow at `.github/workflows/release.yml` produces 17 artifacts across 3 OSes + a signed container image; this checklist verifies they actually work on end-user machines before the release goes public.

Canonical reference: [`docs/operations/release.md`](../../../docs/operations/release.md).

## Why this skill exists

v0.0.80 was deleted after Windows postinstall + macOS Codex 403 failures; v0.0.83 was deleted after container-build Trivy SHA-tag mismatch + transient Windows NSIS 502. Both would have been caught by a disciplined pre-publish smoke. This skill codifies the smoke so regressions don't slip through.

## Preconditions

- Draft release exists at `https://github.com/jrmatherly/1dev/releases/tag/v0.0.XX`
- `gh` CLI authenticated
- You have access to macOS (both archs if possible), Linux, Windows — VMs are acceptable
- `docker` + `cosign` + `trivy` available locally for the container verification step

## Step 1 — Verify CI matrix all green

```bash
gh run list --workflow="🚀 Release" --limit 5
gh run view <release-run-id> --log | grep -E "(fail|error|Error)" | head -20
```

All 3 build jobs (macOS, Linux, Windows) must be green. If any failed, stop here and investigate — do NOT proceed to smoke.

## Step 2 — Artifact inventory

Expected artifact count: **17** (per v0.0.85 baseline).

| OS | Artifacts | Count |
|---|---|---|
| macOS arm64 | `.dmg`, `.zip`, `.dmg.blockmap`, `-mac.yml` | 4 |
| macOS x64 | `.dmg`, `.zip`, `.dmg.blockmap` | 3 |
| Linux | `.AppImage`, `.deb`, `.AppImage.blockmap`, `latest-linux.yml` | 4 |
| Windows | `.exe` (NSIS), `-portable.exe`, `.exe.blockmap`, `latest.yml` | 4 |
| Container | multi-arch image `ghcr.io/jrmatherly/1code-api:v0.0.XX` signed | 1 + 1 sig |

Download inventory:

```bash
gh release download v0.0.XX --dir /tmp/release-v0.0.XX
ls -la /tmp/release-v0.0.XX | wc -l
```

If count < 17, a job silently dropped an artifact. Investigate.

## Step 3 — macOS Gatekeeper check (arm64)

On an Apple Silicon Mac:

```bash
# Download → drag to Applications → first-run attempt
xattr -l /Applications/1Code.app  # should show com.apple.quarantine initially
codesign -dv --verbose=4 /Applications/1Code.app 2>&1 | head -10
spctl -a -vv /Applications/1Code.app
```

Expected:
- `codesign` shows Apple Developer ID with notarization ticket stapled
- `spctl` prints `accepted` + `Notarized Developer ID`

**First-launch test**: double-click the DMG, drag app to Applications, launch. Gatekeeper should NOT show "cannot be opened because it is from an unidentified developer." If it does, notarization failed and the release must be deleted.

Repeat on an Intel Mac for the x64 artifact.

## Step 4 — Linux AppImage + .deb

On a Linux host (Ubuntu 22.04 or similar):

```bash
# AppImage
chmod +x /tmp/release-v0.0.XX/1Code-v0.0.XX.AppImage
/tmp/release-v0.0.XX/1Code-v0.0.XX.AppImage --appimage-help
./1Code-v0.0.XX.AppImage  # should launch cleanly

# .deb
sudo apt install ./1Code-v0.0.XX.deb
1code  # or whatever the binary name is
```

Verify auth-bypass dev flag works for initial smoke (login infrastructure is out-of-scope for a release smoke — use `MAIN_VITE_DEV_BYPASS_AUTH=true`).

## Step 5 — Windows SmartScreen + NSIS install

On Windows 10/11:

1. Download the NSIS `.exe` — SmartScreen should allow it (code-signed). If SmartScreen warns "publisher unknown", the Windows signing step failed silently. Delete release.
2. Install → launch → verify app boots, sidebar loads, splash clears.
3. Launch the portable `-portable.exe` — should also boot cleanly from any location.

Known gotcha: v0.0.80 Windows postinstall failed because `electron-builder` didn't include a native dep. Verify the app reaches the main window, not a crash dialog.

## Step 6 — Auto-update test

Install the prior version (`v0.0.84`) first if possible, then:

1. Launch it.
2. The auto-updater polls GitHub Releases and should detect v0.0.XX within a few minutes.
3. Accept the update prompt → app restarts → version in About window reflects v0.0.XX.

If the updater doesn't find the new version, check `latest.yml` / `latest-mac.yml` / `latest-linux.yml` in the artifacts — they must reference the release assets correctly.

## Step 7 — Container image verification

```bash
# Pull
docker pull ghcr.io/jrmatherly/1code-api:v0.0.XX

# Verify Cosign signature (keyless, GitHub OIDC)
cosign verify \
  --certificate-identity-regexp "^https://github.com/jrmatherly/1dev" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/jrmatherly/1code-api:v0.0.XX

# Verify Trivy scan ran clean (or had only .trivyignore'd CVEs)
trivy image --severity HIGH,CRITICAL ghcr.io/jrmatherly/1code-api:v0.0.XX
```

Cosign must succeed (non-zero = unsigned = delete release). Trivy should show no unaccepted HIGH/CRITICAL CVEs; check `.trivyignore` for exemptions.

## Step 8 — Codex + Claude CLI launch

On each OS, run a round-trip chat to verify the embedded binaries work:

1. Open 1Code → sign in (or dev-bypass).
2. Start a chat with Claude Code backend → send "hello" → verify response streams.
3. Switch to Codex backend → send "hello" → verify response streams.

This catches issues like the v0.0.80 macOS Codex 403 regression (API contract change in the pinned 0.118.0 binary's download URL).

## Step 9 — Notarization staple verification (macOS only)

```bash
stapler validate /Applications/1Code.app
# Expected: "The validate action worked!"
```

If staple validation fails, the DMG shipped without the stapled notarization ticket — users with stale Gatekeeper caches will get the "cannot verify" dialog. Delete and re-release.

## Step 10 — Promote draft → published

Only after all steps above pass:

```bash
gh release edit v0.0.XX --draft=false --latest
```

This makes the release visible at `https://github.com/jrmatherly/1dev/releases/latest` and triggers the auto-updater across all deployed clients.

## On any failure

**DELETE the release** before it auto-promotes:

```bash
gh release delete v0.0.XX --yes
git tag -d v0.0.XX
git push --delete origin v0.0.XX
```

Then fix the root cause and re-release. **Do not** ship a patch over a broken release — users who downloaded the broken version will be stuck on it until they manually re-download.

## Smoke summary log

After a successful smoke, capture the log:

```
v0.0.XX smoke — 2026-MM-DD
✅ Step 1 CI green (run <id>)
✅ Step 2 Artifact inventory (17/17)
✅ Step 3 macOS arm64 Gatekeeper + first launch
✅ Step 3 macOS x64 Gatekeeper + first launch
✅ Step 4 Linux AppImage + .deb launch
✅ Step 5 Windows SmartScreen + NSIS install
✅ Step 6 Auto-update from v0.0.(X-1)
✅ Step 7 Container Cosign + Trivy verification
✅ Step 8 Codex + Claude CLI round-trip (3 OS)
✅ Step 9 macOS notarization staple
✅ Step 10 Promoted
```

Append to `docs/operations/release.md` → "Release history" section if that section exists, otherwise reference from the roadmap "Recently Completed" table.

## Related

- `docs/operations/release.md` — canonical release runbook
- `.claude/skills/release/SKILL.md` — the release initiation skill (this smoke skill is the post-build companion)
- `.github/workflows/release.yml` — the 3-OS matrix workflow
- `.github/workflows/container-build.yml` — the container + Cosign workflow
