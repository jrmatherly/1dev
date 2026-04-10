---
name: release
description: Guide the GitHub Actions release flow — version bump, tag push, verify CI, publish draft
disable-model-invocation: true
---

## Release Checklist

Walk through each step, verifying success before proceeding. The canonical release documentation is at [`docs/operations/release.md`](../../docs/operations/release.md).

### 1. Version Bump
```bash
npm version patch --no-git-tag-version   # or minor / major
```
Read `package.json` to confirm the new version number.

### 2. Commit + Tag + Push
```bash
git add package.json bun.lock
git commit -m "chore: bump version to v0.0.XX"
git tag v0.0.XX
git push origin main --follow-tags
```
The `push: tags: ['v*']` trigger in `.github/workflows/release.yml` fires automatically.

### 3. Monitor CI
```bash
gh run list --workflow=release.yml --limit 3
gh run watch <run-id> --exit-status
```
The workflow builds installers on macos-15, Ubuntu, and Windows in parallel, then publishes a **draft** GitHub Release with all artifacts.

### 4. Review + Publish
Go to [Releases](https://github.com/jrmatherly/1dev/releases), find the draft, review the artifacts and auto-generated notes, then click **Publish release** (or use CLI):
```bash
gh release edit v0.0.XX --draft=false
```

Once published, `electron-updater`'s GitHub provider will see the release and offer auto-updates to installed users.

### Manual Dispatch (for re-releases or testing)
```bash
gh workflow run release.yml --ref main --field version=v0.0.XX
```
The tag must already exist.

### Important Notes
- **First iteration releases are UNSIGNED** — macOS users need `xattr -d com.apple.quarantine /Applications/1Code.app` after install. Code signing is tracked as a roadmap item.
- **v0.0.72 users must manually reinstall** — older installs have the dead CDN provider baked in and cannot auto-update. See release.md "First Release After Pipeline Migration" section.
- **Beta channel is disabled** — `auto-updater.ts` is locked to "latest" channel. Beta support requires `generateUpdatesFilesForAllChannels: true` in the electron-builder config.

See [`docs/operations/release.md`](../../docs/operations/release.md) for the full runbook including troubleshooting, code-signing plan, and the complete artifact table.
