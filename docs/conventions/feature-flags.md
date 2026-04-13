---
title: Feature Flags
icon: toggle-left
---

# Feature Flags

> **Stub.** Content authoring deferred to a follow-on change.

## TODO

- `feature_flag_overrides` Drizzle table schema
- `src/main/lib/feature-flags.ts` typed API
- `src/main/lib/trpc/routers/feature-flags.ts` CRUD router
- Default flag values and the `FLAG_DEFAULTS` record
- How to add a new flag

See the `add-feature-flag-infrastructure` OpenSpec change for the implementation history.

## Current flags (snapshot — source of truth is `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`)

| Key | Type | Default | Purpose |
|---|---|---|---|
| `enterpriseAuthEnabled` | boolean | `false` | Phase 0 gate #8 cutover — Entra/Envoy auth path |
| `voiceViaLiteLLM` | boolean | `false` | F4 voice transcription cutover to LiteLLM Whisper |
| `changelogSelfHosted` | boolean | `false` | F6 changelog cutover from upstream to self-hosted |
| `automationsSelfHosted` | boolean | `false` | F2 automations backend cutover |
| `credentialStorageRequireEncryption` | boolean | `false` | Refuse Tier 2 credential storage (Linux basic_text) |
| `auxAiEnabled` | boolean | `true` | Master kill-switch for aux-AI (sub-chat name + commit msg) |
| `auxAiModel` | string | `""` | Operator override for aux-AI model (precedence: flag → modelMap → default) |
| `auxAiTimeoutMs` | number | `5000` | Per-call timeout for aux-AI SDK invocation |
| `auxAiOrigin` | string | `""` | Reserved — operator override for aux-AI upstream origin |

The `auxAi*` flags drive `src/main/lib/aux-ai.ts`, which dispatches sub-chat name and commit-message generation across four `ProviderMode` kinds (subscription-direct, subscription-litellm, byok-direct, byok-litellm) with Ollama/truncated fallbacks. See `openspec/changes/remediate-dev-server-findings/design.md` Decision 1 for the dispatch matrix.
