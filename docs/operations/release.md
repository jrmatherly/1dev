---
title: Release Pipeline
icon: rocket
---

# Release Pipeline {subtitle="Build, publish, and ship 1Code releases via GitHub Actions"}

This document describes the end-to-end release pipeline for 1Code Enterprise Fork. Releases are built by GitHub Actions on `macos-latest`, `ubuntu-latest`, and `windows-latest` runners and published as binary assets on a [GitHub Release](https://github.com/jrmatherly/1dev/releases). Installed apps auto-update via `electron-updater`'s native GitHub provider.

## Architecture

```
git tag v0.0.73
  ↓ (push origin v0.0.73)
.github/workflows/release.yml
  ├─ matrix-build (parallel, 3 runners)
  │   ├─ macos-latest    → release/*.dmg, *.zip, latest-mac.yml, latest-mac-x64.yml
  │   ├─ ubuntu-latest   → release/*.AppImage, *.deb, latest-linux.yml
  │   └─ windows-latest  → release/*.exe, latest.yml
  └─ release (needs: matrix-build)
      └─ softprops/action-gh-release@v2
          → draft GitHub Release with all installers + update manifests
```

Once the draft Release is published, `electron-updater` in installed apps polls the GitHub Releases API, reads the update manifest (`latest-mac.yml` / `latest.yml` / `latest-linux.yml`), and downloads the appropriate ZIP payload for the current platform.

## Triggering a Release

### Standard path — push a git tag

```bash
npm version patch --no-git-tag-version   # e.g. 0.0.72 → 0.0.73
git add package.json bun.lock
git commit -m "chore: bump version to 0.0.73"
git tag v0.0.73
git push origin main --follow-tags
```

The `push: tags: ['v*']` trigger in `.github/workflows/release.yml` fires automatically. The `release` job creates a **draft** GitHub Release — review the artifacts, then publish it via the GitHub UI or `gh release edit v0.0.73 --draft=false`.

### Manual path — workflow_dispatch

For re-releases or testing, dispatch the workflow manually:

```bash
gh workflow run release.yml --ref main --field version=v0.0.73
```

This builds the same artifacts and creates a draft Release at the given tag (the tag must already exist for `electron-updater` to resolve it; dispatch does **not** create the tag).

## Version Bump

Bump the version **before** tagging:

```bash
npm version patch --no-git-tag-version   # 0.0.72 → 0.0.73
npm version minor --no-git-tag-version   # 0.0.72 → 0.1.0
npm version major --no-git-tag-version   # 0.0.72 → 1.0.0
```

Use `patch` for bug fixes, `minor` for new features, `major` for breaking changes. The `--no-git-tag-version` flag prevents npm from auto-tagging — you create the tag yourself after committing the bumped `package.json`.

## Artifacts per Release

Each release produces the following files as GitHub Release assets:

| Platform | File | Purpose |
|---|---|---|
| **macOS arm64** | `1Code-{version}-arm64.dmg` | Manual download |
| **macOS arm64** | `1Code-{version}-arm64-mac.zip` | Auto-update payload |
| **macOS arm64** | `latest-mac.yml` | Auto-update manifest |
| **macOS Intel** | `1Code-{version}.dmg` | Manual download |
| **macOS Intel** | `1Code-{version}-mac.zip` | Auto-update payload |
| **macOS Intel** | `latest-mac-x64.yml` | Auto-update manifest |
| **Linux** | `1Code-{version}.AppImage` | Manual download + auto-update |
| **Linux** | `1code-desktop_{version}_amd64.deb` | Manual download |
| **Linux** | `latest-linux.yml` | Auto-update manifest |
| **Windows** | `1Code-Setup-{version}.exe` | NSIS installer |
| **Windows** | `1Code-{version}-portable.exe` | Portable executable |
| **Windows** | `latest.yml` | Auto-update manifest |
| **All** | `*.blockmap` | `electron-updater` delta-update data |

## Auto-Update Flow

`electron-updater` handles auto-updates automatically for installed users:

1. App checks the GitHub Releases API on startup and when the window regains focus (with a 1-minute cooldown in `src/main/lib/auto-updater.ts`).
2. If the latest release tag is greater than the current app version, the app shows an **"Update Available"** banner.
3. User clicks **Download** → the ZIP downloads in the background from the Release asset URL.
4. User clicks **"Restart Now"** → `electron-updater` replaces the current binary and relaunches the app.

The feed URL is **not** set at runtime. Instead, `electron-builder` bakes `app-update.yml` into the packaged app during `bun run package:*`, using the `build.publish` config from `package.json` (`provider: "github"`, `owner: "jrmatherly"`, `repo: "1dev"`). Changes to the `publish` config require a rebuild; they are not hot-reloadable on installed apps.

## First Release After Pipeline Migration (v0.0.72 → v0.0.73)

> **Important:** Existing v0.0.72 installs (and any earlier version) have `app-update.yml` baked in with `provider: "generic", url: "https://cdn.apollosai.dev/releases/desktop"`. That CDN is dead. When v0.0.73 is released via the new GitHub Releases pipeline, **those installs will NOT auto-update** — they'll keep polling the dead CDN and silently fail.
>
> **Users must manually download v0.0.73** from the GitHub Release page to get the new auto-update feed. After that one-time reinstall, all future releases will auto-update normally.
>
> **Recommended user-notification strategy:**
> - Pin a GitHub Issue linking to the v0.0.73 release page
> - Add a note in the release notes: "Users on v0.0.72 or earlier must manually download this release"
> - If you have analytics on installed-version distribution, consider an Entra-notification or email broadcast

## Code Signing (Not Yet Enabled)

> ⚠️ **First-iteration releases are UNSIGNED** on all 3 operating systems.

Users will see:

- **macOS:** Gatekeeper will refuse to open the unsigned app by default. Workaround after dragging to Applications:
  ```bash
  xattr -cr /Applications/1Code.app
  ```
- **Windows:** SmartScreen will warn "Windows protected your PC". Users click "More info" → "Run anyway".
- **Linux:** No signing required for AppImage/DEB; these run normally.

### Enabling Signing (Follow-on Work)

To enable signed builds, provision these repo secrets (currently **none** are set — check with `gh secret list`):

| Secret | Purpose | Source |
|---|---|---|
| `APPLE_ID` | Apple Developer account email | Apple Developer Program |
| `APPLE_ID_PASSWORD` | App-specific password | [appleid.apple.com](https://appleid.apple.com/account/manage) |
| `APPLE_TEAM_ID` | Team identifier | Apple Developer Portal |
| `CSC_LINK` | macOS certificate `.p12` (base64) | Developer ID Application cert export |
| `CSC_KEY_PASSWORD` | macOS cert password | Set when exporting cert |
| `WINDOWS_CSC_LINK` | Windows code-signing cert (base64) | EV or OV cert from Sectigo/DigiCert |
| `WINDOWS_CSC_KEY_PASSWORD` | Windows cert password | Set when exporting cert |

Then remove the `CSC_IDENTITY_AUTO_DISCOVERY: "false"` override from `.github/workflows/release.yml` and add notarization + CSC env blocks to the macOS and Windows matrix legs.

## Troubleshooting

### Workflow fails at "Package for {os} (unsigned)"

Check the job log for the specific error. Common causes:

- **Native module rebuild failure** — `electron-rebuild` is triggered on `bun install` via postinstall. If a native dep (better-sqlite3, node-pty) fails to rebuild for the Electron version, the package step fails. Verify `electron-rebuild` works locally first.
- **Missing build deps on Ubuntu** — the workflow installs `build-essential python3 libopenjp2-tools rpm libarchive-tools`. If electron-builder needs a tool not in this list, add it to the "Install Linux system build deps" step.

### "No such file or directory" on upload step

The upload step uses `if-no-files-found: error`, so if the package step produced no matching files, the artifact upload fails loudly. Check the "List build output" step's output to see what was actually in `release/`.

### Workflow succeeds but no Release is created

The release job creates a **draft** by default (`draft: true`). Find it at [github.com/jrmatherly/1dev/releases](https://github.com/jrmatherly/1dev/releases) and publish via the UI or:

```bash
gh release edit v0.0.73 --draft=false
```

### electron-updater can't find updates after the release is published

1. Verify the release is **published** (not draft) — auto-update ignores drafts.
2. Verify the tag matches the `version` in `package.json` at build time.
3. Verify `latest-mac.yml` / `latest.yml` / `latest-linux.yml` is attached as a Release asset.
4. Check the app's logs: `~/Library/Logs/1Code/main.log` on macOS.

### Need to delete and re-release the same tag

GitHub does not allow overwriting a tag's release assets. To re-release:

```bash
gh release delete v0.0.73 --cleanup-tag --yes
git tag -d v0.0.73
git push origin :refs/tags/v0.0.73
# ... fix the issue ...
git tag v0.0.73
git push origin v0.0.73
```

The `push:tag` trigger will fire again and create a fresh Release.

## Related Documentation

- [Pinned Dependencies](../conventions/pinned-deps.md) — why Claude CLI and Codex binary versions are pinned
- [Quality Gates](../conventions/quality-gates.md) — what must pass before a release
- [Cluster Access](./cluster-access.md) — Talos cluster operations (separate topic, deferred)
- [Upstream Features](../enterprise/upstream-features.md) — F5 (auto-update) restoration notes
