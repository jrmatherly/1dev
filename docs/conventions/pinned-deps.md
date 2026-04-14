---
title: Pinned Dependencies
icon: pin
---

# Pinned Dependencies

> **Stub.** Content authoring deferred to a follow-on change.

## Load-Bearing Pins (DO NOT BUMP CASUALLY)

| Package | Pin | Reason |
|---------|-----|--------|
| Vite | 7.x | Vite 8 requires `electron-vite` 6.0.0 (beta-only as of 2026-04-10); Vite 7.3.2 runs on electron-vite 5.0.0. Upgraded from 6.4.2 on 2026-04-10. |
| shiki | 4.0.2 | Upgraded from 3.x on 2026-04-10 via `upgrade-shiki-4` OpenSpec change (merged as PR #11). The original roadmap assumption that `@pierre/diffs` pinning `shiki: ^3.0.0` was a peer-dep conflict was WRONG — `@pierre/diffs` declares shiki as a regular `dependency` (not `peerDependency`), so Bun simply installs a nested duplicate `shiki@3.23.0` under `@pierre/diffs/node_modules/` while top-level `shiki` advances to 4.0.2. Dual-version install verified empirically (`node_modules/shiki` = 4.0.2, `node_modules/@pierre/diffs/node_modules/shiki` = 3.23.0). The "pin" here is the exact-version constraint (`"shiki": "4.0.2"` in `package.json`) — not a version-range constraint blocked by anything. |
| Electron | ~41.2 | EOL 2026-08-25 — Chromium 146, Node.js 24.14, V8 14.6. Upgraded from ~40.8 on 2026-04-09. |
| Claude CLI binary | 2.1.96 | Session resume + streaming tested at this version |
| Codex CLI binary | 0.118.0 | `@zed-industries/codex-acp` bridge tested at this version |
| `@azure/msal-node` | ^5.1.2 | Upgraded from 3.8.x — `@azure/msal-node-extensions` is a separate package |
| `@xyd-js/cli` | `0.0.0-build-1202121-20260121231224` | Docs site generator; empirically validated 2026-04-09 |
| `@anthropic-ai/sdk` | ^0.88.0 | Promoted from transitive (was pulled in only via `@anthropic-ai/claude-agent-sdk`) to an explicit top-level dependency on 2026-04-13 by `remediate-dev-server-findings` at `^0.81.0`, then bumped to `^0.88.0` on 2026-04-13 after a ground-truth diff of `src/client.ts` and `src/resources/messages/messages.ts` between tags `sdk-v0.81.0` and `sdk-v0.88.0` confirmed zero breaking changes to the four constructor options we use (`apiKey`, `authToken`, `baseURL`, `defaultHeaders`) or the `messages.create()` method signature. All seven intermediate minors (0.82 – 0.88) are additive (Vertex / Bedrock / Managed-Agents / advisor-tool features we do not consume); the single deprecation (client-side compaction helpers in 0.83.0) is unrelated to `aux-ai.ts`. The pin protects us from upstream re-hoisting and documents the verified safe version. |

Use the `verify-pin` skill before bumping any of these.

See CLAUDE.md "Dependency Version Constraints" section for the current source.
