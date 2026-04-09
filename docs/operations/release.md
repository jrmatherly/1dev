---
title: Release Pipeline
icon: rocket
---

# Release Pipeline

> **Stub.** Content authoring deferred to a follow-on change.

## TODO

- `bun run release` full pipeline
- Version bump (`npm version patch --no-git-tag-version`)
- Notarization (`xcrun notarytool`, keychain profile `apollosai-notarize`)
- Stapling (`xcrun stapler staple release/*.dmg`)
- CDN upload (`scripts/upload-release.mjs` to R2)
- Auto-update flow (manifest check → download ZIP → restart)
- Files uploaded to CDN (manifests, ZIPs, DMGs)

See CLAUDE.md "Releasing a New Version" section for the current source.
