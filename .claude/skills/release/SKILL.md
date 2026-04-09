---
name: release
description: Guide the full macOS release flow — version bump, binary download, build, sign, notarize, upload, and sync
disable-model-invocation: true
---

## Release Checklist

Walk through each step, verifying success before proceeding.

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
Verify binaries exist in the expected locations.

### 3. Build & Package
```bash
bun run build
bun run package:mac
```
Check `release/` directory for output artifacts.

### 4. Generate Update Manifests
```bash
bun run dist:manifest
```
Verify `latest-mac.yml` and `latest-mac-x64.yml` were generated.

### 5. Upload & Submit Notarization
```bash
./scripts/upload-release-wrangler.sh
```

### 6. Wait for Notarization
```bash
xcrun notarytool history --keychain-profile "21st-notarize"
```
Poll until the latest submission shows "Accepted" (typically 2-5 min).

### 7. Staple DMGs
```bash
cd release && xcrun stapler staple *.dmg
```

### 8. Re-upload Stapled DMGs
See RELEASE.md for the exact R2 and GitHub upload commands.

### 9. Update Changelog
```bash
gh release edit v{VERSION} --notes "..."
```

### 10. Upload Manifests (triggers auto-updates)
See RELEASE.md for manifest upload commands.

### 11. Sync to Public
```bash
./scripts/sync-to-public.sh
```

Report the final version number and CDN URLs when complete.
