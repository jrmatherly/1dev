---
name: release
description: Guide the full macOS release flow — version bump, binary download, build, sign, notarize, upload, and sync
disable-model-invocation: true
---

## Release Checklist

Walk through each step, verifying success before proceeding. The canonical release documentation is at [`docs/operations/release.md`](../../docs/operations/release.md).

### 1. Version Bump
```bash
npm version patch --no-git-tag-version
```
Read `package.json` to confirm the new version number.

### 2. Download AI Binaries
```bash
bun run claude:download
bun run codex:download
```
Verify binaries exist in `resources/bin/`.

### 3. Build & Package
```bash
bun run build
bun run package:mac
```
Check `release/` directory for output artifacts (DMG + ZIP for arm64 and x64).

### 4. Generate Update Manifests
```bash
bun run dist:manifest
```
Verify `latest-mac.yml` and `latest-mac-x64.yml` were generated in `release/`.

### 5. Upload to CDN
```bash
bun run dist:upload
```
Uploads artifacts to R2 CDN at `cdn.apollosai.dev/releases/desktop/`.

### 6. Wait for Notarization
```bash
xcrun notarytool history --keychain-profile "apollosai-notarize"
```
Poll until the latest submission shows "Accepted" (typically 2-5 min). On pre-rebrand dev machines, try `"21st-notarize"` if the profile is not found.

### 7. Staple DMGs
```bash
cd release && xcrun stapler staple *.dmg
```

### 8. Re-upload Stapled DMGs
```bash
bun run dist:upload
```
Re-runs the upload with stapled DMGs. Also upload to GitHub release.

### 9. Update Changelog
```bash
gh release edit v{VERSION} --notes "..."
```

### 10. Upload Manifests (triggers auto-updates)
The manifests (`latest-mac.yml` / `latest-mac-x64.yml`) are uploaded as part of `dist:upload`. **This triggers auto-updates for all existing installs** — only run after notarization, stapling, and re-upload are complete.

Report the final version number and CDN URLs when complete.

See [`docs/operations/release.md`](../../docs/operations/release.md) for the full runbook including troubleshooting, CDN base URL for self-hosted forks, and the complete artifact table.
