---
title: Pinned Dependencies
icon: pin
---

# Pinned Dependencies

> **Stub.** Content authoring deferred to a follow-on change.

## Load-Bearing Pins (DO NOT BUMP CASUALLY)

| Package | Pin | Reason |
|---------|-----|--------|
| Vite | 6.x | Vite 8 requires `electron-vite` 6.0.0 (beta-only as of 2026-04-09); Vite 7 is safe with electron-vite 5.0.0 |
| Tailwind CSS | 3.x | `tailwind-merge` v3 requires Tailwind v4; 134 files use `cn()` |
| shiki | 3.x | `@pierre/diffs` pins `shiki: ^3.0.0`; v4 blocked until upstream update |
| Electron | ~40.8.5 | EOL 2026-06-30 — upgrade to 41 tracked in OpenSpec `upgrade-electron-41` |
| Claude CLI binary | 2.1.96 | Session resume + streaming tested at this version |
| Codex CLI binary | 0.118.0 | `@zed-industries/codex-acp` bridge tested at this version |
| `@azure/msal-node` | ^5.1.2 | Upgraded from 3.8.x — `@azure/msal-node-extensions` is a separate package |
| `@xyd-js/cli` | `0.0.0-build-1202121-20260121231224` | Docs site generator; empirically validated 2026-04-09 |

Use the `verify-pin` skill before bumping any of these.

See CLAUDE.md "Dependency Version Constraints" section for the current source.
