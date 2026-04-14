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
git tag -a v0.0.XX -m "v0.0.XX"          # annotated tag (required for --follow-tags)
git push origin main v0.0.XX             # push branch AND tag explicitly
```
The `push: tags: ['v*']` trigger in `.github/workflows/release.yml` fires automatically.

**Gotcha — lightweight tags vs `--follow-tags`:** `git tag v0.0.XX` (no `-a`) creates a **lightweight** tag. `git push --follow-tags` only pushes **annotated** tags, so lightweight tags get left behind locally — the commit hits `main`, but the workflow never fires because the tag isn't on the remote. Two safe patterns:
- Use `git tag -a v0.0.XX -m "v0.0.XX"` to create an annotated tag, OR
- Push the tag explicitly by name: `git push origin main v0.0.XX`

If you accidentally run `git push --follow-tags` with a lightweight tag, fix it with `git push origin v0.0.XX` — the workflow picks it up as soon as the tag lands on the remote.

**Verify the tag hit the remote before assuming CI fired:**
```bash
git ls-remote --tags origin v0.0.XX      # should print the SHA + refs/tags/v0.0.XX
gh run list --workflow=release.yml --limit 1    # should show the queued run
```

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
- **First iteration releases are UNSIGNED** — macOS users need `xattr -rd com.apple.quarantine /Applications/1Code.app` after install. Code signing is tracked as a roadmap item.
- **v0.0.72 users must manually reinstall** — older installs have the dead CDN provider baked in and cannot auto-update. See release.md "First Release After Pipeline Migration" section.
- **Beta channel is disabled** — `auto-updater.ts` is locked to "latest" channel. Beta support requires `generateUpdatesFilesForAllChannels: true` in the electron-builder config.

See [`docs/operations/release.md`](../../docs/operations/release.md) for the full runbook including troubleshooting, code-signing plan, and the complete artifact table.
