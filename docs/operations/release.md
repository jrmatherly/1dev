---
title: Release Pipeline
icon: rocket
---

# Release Pipeline {subtitle="Build, sign, notarize, upload, and ship 1Code releases"}

This document describes the end-to-end release pipeline for 1Code Enterprise Fork. Releases are built locally on macOS (for signing and notarization), uploaded to Cloudflare R2 at `cdn.apollosai.dev`, and delivered to users via `electron-updater`'s auto-update mechanism.

## Prerequisites

### Notarization Keychain Profile

Notarization requires an Apple Developer account and a stored credential profile in your keychain.

**New installs** use the keychain profile `apollosai-notarize`:

```bash
xcrun notarytool store-credentials "apollosai-notarize" \
  --apple-id YOUR_APPLE_ID \
  --team-id YOUR_TEAM_ID
```

**Existing dev machines** may still use the pre-rebrand `21st-notarize` profile. If a notarize step fails, check both profiles:

```bash
xcrun notarytool history --keychain-profile "apollosai-notarize"
xcrun notarytool history --keychain-profile "21st-notarize"
```

### CDN Access

The release upload step writes to Cloudflare R2 at `cdn.apollosai.dev`. You need R2 credentials configured for `scripts/upload-release.mjs` to succeed.

## Release Commands

### Full Release (Recommended)

```bash
bun run release
```

This runs the complete pipeline: downloads binaries, builds, signs, and uploads.

### Step-by-Step (For Debugging)

If the full pipeline fails partway through, or you want to inspect intermediate artifacts:

```bash
bun run claude:download    # Download Claude CLI binary (pinned 2.1.96)
bun run codex:download     # Download Codex binary (pinned 0.118.0)
bun run build              # Compile TypeScript via electron-vite
bun run package:mac        # Build & sign macOS app (DMG + ZIP)
bun run dist:manifest      # Generate latest-mac.yml + latest-mac-x64.yml
bun run dist:upload        # Upload built artifacts to R2 CDN
```

> **Notarization** is submitted automatically by `electron-builder` when the signing step succeeds. **Stapling** and **manifest re-upload** are manual steps (see below).

## Version Bump

Bump the version before running the release pipeline:

```bash
npm version patch --no-git-tag-version  # e.g. 0.0.72 → 0.0.73
```

Use `patch` for bug fixes, `minor` for new features, `major` for breaking changes. The `--no-git-tag-version` flag prevents npm from creating a git tag — tags are handled later via `gh release`.

## After the Release Script Completes

The release script submits notarization but does not wait for it. Complete these manual steps:

1. **Wait for notarization** (2-5 minutes):

    ```bash
    xcrun notarytool history --keychain-profile "apollosai-notarize"
    ```

    (Substitute `21st-notarize` on pre-rebrand dev machines.)

2. **Staple the DMGs**:

    ```bash
    cd release && xcrun stapler staple *.dmg
    ```

3. **Re-upload stapled DMGs** to R2 and GitHub release:

    ```bash
    bun run dist:upload  # Re-runs the upload with stapled DMGs
    ```

4. **Update the changelog** on the GitHub release:

    ```bash
    gh release edit v0.0.X --notes "..."
    ```

5. **Upload manifests** — this is the step that triggers auto-updates for existing installs. Only run it after notarization, stapling, and re-upload are complete.

## Files Uploaded to CDN

Each release produces the following artifacts, all uploaded to `https://cdn.apollosai.dev/releases/desktop/`:

| File | Purpose |
|------|---------|
| `latest-mac.yml` | Auto-update manifest for arm64 |
| `latest-mac-x64.yml` | Auto-update manifest for Intel |
| `1Code-{version}-arm64-mac.zip` | Auto-update payload (arm64) |
| `1Code-{version}-mac.zip` | Auto-update payload (Intel) |
| `1Code-{version}-arm64.dmg` | Manual download (arm64) |
| `1Code-{version}.dmg` | Manual download (Intel) |

## Auto-Update Flow

`electron-updater` handles auto-updates automatically for users once the manifests are uploaded:

1. App checks `https://cdn.apollosai.dev/releases/desktop/latest-mac.yml` on startup and when the window regains focus (with a 1-minute cooldown to avoid hammering the CDN).
2. If the version in the manifest is greater than the current version, the app shows an **"Update Available"** banner.
3. User clicks **Download** → the ZIP downloads in the background.
4. User clicks **"Restart Now"** → `electron-updater` installs the update and restarts the app.

## CDN Base URL for Self-Hosted Forks

The auto-update CDN base URL is defined in `src/main/lib/auto-updater.ts` via the `CDN_BASE` constant. The default is `https://cdn.apollosai.dev/releases/desktop`.

**Self-hosted forks must change `CDN_BASE`** (or override the feed URL via `electron-updater`'s `setFeedURL`) to point at their own release channel before shipping.

## Troubleshooting

### Notarization takes more than 10 minutes

Apple's notarization service can back up during peak hours. Check status with:

```bash
xcrun notarytool log <submission-id> --keychain-profile "apollosai-notarize"
```

If the submission is stuck in `In Progress` for more than 20 minutes, contact Apple Developer Support.

### Signing fails with "no identity found"

Your developer certificate may have expired or been revoked. Check:

```bash
security find-identity -v -p codesigning
```

If no valid identity is listed, regenerate a Developer ID Application certificate from the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list) and import it into your keychain.

### Stapling fails with "The staple and validate action failed"

The DMG hasn't been notarized yet, or notarization was rejected. Re-run `xcrun notarytool history` to check status.

### R2 upload fails with 403

Your R2 credentials have expired or the bucket policy has changed. Regenerate credentials in the Cloudflare dashboard and update your local environment.

## Related Documentation

- [Pinned Dependencies](../conventions/pinned-deps.md) — why Claude CLI and Codex binary versions are pinned
- [Quality Gates](../conventions/quality-gates.md) — what must pass before a release
- [Cluster Access](./cluster-access.md) — Talos cluster operations (separate topic, but often coordinated with releases)
