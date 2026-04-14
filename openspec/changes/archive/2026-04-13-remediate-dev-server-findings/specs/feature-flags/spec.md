## ADDED Requirements

### Requirement: Auxiliary-AI feature flags

The `FLAG_DEFAULTS` export in `src/main/lib/feature-flags.ts` SHALL include four new entries governing auxiliary-AI features (chat title generation, commit message generation):

- `auxAiEnabled: true` — boolean master kill switch. When false, both `generateChatTitle` and `generateCommitMessage` return the truncated fallback without any provider call.
- `auxAiModel: ""` — string override for the Anthropic-mode model id. Empty string means "use the precedence chain: `mode.modelMap.haiku` when available, else `claude-3-5-haiku-latest`". Non-empty string forces this exact model id regardless of the active account's configuration.
- `auxAiTimeoutMs: 5000` — number. Per-call timeout for provider requests, used to construct the `AbortSignal` passed to the Anthropic SDK.
- `auxAiOrigin: ""` — string. Reserved for future operator tuning (forced LiteLLM endpoint override). Empty string means "use the active account's endpoint". The current implementation does not consume this flag; it is reserved to avoid a future breaking flag-rename.

All four flags SHALL be persistable via the existing `feature_flag_overrides` table and readable via `getFlag<K>(key)`. No env var counterparts are introduced — the flags are the sole configuration surface for auxiliary-AI behavior.

#### Scenario: Default values support out-of-the-box auxiliary-AI

- **WHEN** no `feature_flag_overrides` rows exist for the `auxAi*` keys
- **THEN** `getFlag("auxAiEnabled")` returns `true`
- **AND** `getFlag("auxAiModel")` returns `""` (empty string — triggers the resolution precedence chain)
- **AND** `getFlag("auxAiTimeoutMs")` returns `5000`
- **AND** `getFlag("auxAiOrigin")` returns `""`

#### Scenario: Kill switch disables provider calls

- **WHEN** `setFlag("auxAiEnabled", false)` has been called
- **AND** a chat is created
- **THEN** `generateChatTitle` and `generateCommitMessage` both return `getFallbackName(...)` immediately
- **AND** no Anthropic SDK or Ollama call is attempted

#### Scenario: Model override survives restart

- **WHEN** `setFlag("auxAiModel", "claude-sonnet-4-5")` has been called
- **AND** the app restarts
- **THEN** the override persists via `feature_flag_overrides` table
- **AND** `getFlag("auxAiModel")` returns `"claude-sonnet-4-5"` after restart

#### Scenario: Type safety — auxAiEnabled is inferred as boolean

- **WHEN** TypeScript code calls `getFlag("auxAiEnabled")`
- **THEN** the return value is inferred as `boolean` (not `boolean | string | number`)
- **AND** TypeScript code calls `getFlag("auxAiModel")` returns `string`
- **AND** TypeScript code calls `getFlag("auxAiTimeoutMs")` returns `number`
