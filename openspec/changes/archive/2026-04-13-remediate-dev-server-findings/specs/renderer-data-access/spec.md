## ADDED Requirements

### Requirement: SignedFetch origin-conditional allowlist

The `api:signed-fetch` IPC handler in `src/main/windows/main.ts` SHALL extend its existing origin-allowlist check (`MAIN_VITE_API_URL` match) with a dead-upstream-detection path. When `MAIN_VITE_API_URL` is unset OR its hostname is `apollosai.dev` (the dead upstream), the handler MUST reject ALL fetches with `{ error: "upstream_unreachable", reason: "disabled_by_env" }` without attempting the network call.

When `MAIN_VITE_API_URL` is set to a live origin (e.g., a future self-hosted `1code-api` endpoint), the handler SHALL permit fetches to that origin per the existing allowlist behavior.

No new env var is introduced. Operators revive upstream testing by setting `MAIN_VITE_API_URL` to a working endpoint (the variable is pre-existing).

#### Scenario: Default startup rejects upstream fetches

- **WHEN** the app starts with `MAIN_VITE_API_URL` unset (default)
- **AND** the renderer calls `api:signed-fetch` with `https://apollosai.dev/api/changelog/desktop?per_page=3`
- **THEN** the handler returns `{ error: "upstream_unreachable", reason: "disabled_by_env" }` without attempting fetch
- **AND** exactly ONE `[SignedFetch] upstream disabled for origin <origin>` log line is emitted per origin per process lifetime

#### Scenario: Explicit opt-in for revived upstream

- **WHEN** `MAIN_VITE_API_URL=https://apollosai.dev` is set (operator testing a revived upstream)
- **AND** the renderer calls `api:signed-fetch` with an `apollosai.dev` URL
- **THEN** the handler still rejects the fetch (hostname matches the dead-upstream rule)
- **AND** operators set `MAIN_VITE_API_URL` to a different live endpoint to enable fetches

#### Scenario: Self-hosted endpoint is permitted

- **WHEN** `MAIN_VITE_API_URL=https://api.1code.internal` is set
- **AND** the renderer calls `api:signed-fetch` with an `api.1code.internal` URL
- **THEN** the handler proceeds with the fetch (allowlist match, not dead-upstream hostname)

### Requirement: SignedFetch 60-second per-origin unreachability cache

When a fetch permitted by the allowlist fails with `ECONNREFUSED` or `ENOTFOUND`, the handler SHALL cache the origin + timestamp for 60 seconds. Subsequent calls to the same origin within the cache window MUST return `{ error: "upstream_unreachable", reason: "cached" }` without attempting a new fetch.

The cache SHALL log ONE warning line per origin per cache-refresh event (not per call).

#### Scenario: 10 parallel calls produce one fetch attempt

- **WHEN** 10 calls to `api:signed-fetch` for `https://api.1code.internal/...` fire within 100ms
- **AND** the first fetch rejects with `ENOTFOUND`
- **THEN** exactly ONE actual `fetch` call is made
- **AND** the remaining 9 receive the cached error response
- **AND** exactly ONE `[SignedFetch] Error` log line is emitted

#### Scenario: Cache expires after 60 seconds

- **WHEN** the unreachable cache entry for an origin is older than 60 seconds
- **AND** a new call to `api:signed-fetch` for that origin arrives
- **THEN** a fresh `fetch` is attempted (cache entry treated as stale)

### Requirement: Provider-aware auxiliary-AI dispatch

A new main-process module `src/main/lib/aux-ai.ts` SHALL provide auxiliary-AI features (chat title generation, commit message generation) using a dispatch matrix driven by the active `ProviderMode` resolved by `getActiveProviderMode()`:

- `subscription-litellm` and `byok-litellm` → call `@anthropic-ai/sdk` configured with `baseURL` = `MAIN_VITE_LITELLM_BASE_URL`, `authToken` = `mode.virtualKey`, and `defaultHeaders` = `{ "x-litellm-customer-id": mode.customerId }` when customerId is present.
- `byok-direct` → call `@anthropic-ai/sdk` against `api.anthropic.com` with `apiKey` = `mode.apiKey`.
- `subscription-direct` OR no resolvable mode → fall through to Ollama (if available) → truncated fallback via `getFallbackName()`.

The module SHALL NOT, under any mode, make an outbound fetch to `apollosai.dev`.

**Model resolution precedence:** (1) `getFlag("auxAiModel")` when non-empty → (2) `mode.modelMap.haiku` when mode kind is `subscription-litellm` or `byok-litellm` AND the modelMap is populated → (3) built-in default `claude-3-5-haiku-latest`.

Failures of any backend call (network, timeout, SDK error, non-200 response) SHALL degrade silently to the next backend in the chain, terminating at `getFallbackName()`. Log ONE warning line per failure; do NOT log full stack traces per call.

The module SHALL expose both a DI-friendly factory (`makeGenerateChatTitle(deps: AuxAiDeps)`) and an already-bound convenience export (`generateChatTitle`) for production call sites. The factory accepts `createAnthropic`, `generateOllamaName`, `getProviderMode`, and `getFlag` as injected dependencies, enabling unit-level testing without `mock.module()`.

The `generate-commit-message` call site at `chats.ts:1340` SHALL delegate to `generateCommitMessage(context)` using the same dispatch pattern, with different hardcoded `max_tokens` (200 vs 50) and `temperature` (0.5 vs 0.3) constants.

#### Scenario: byok-direct mode produces an AI-generated title

- **WHEN** the active account is `byok-direct` with a valid Anthropic API key
- **AND** a chat is created with user message "add pagination to the users table"
- **THEN** `generateChatTitle` calls `api.anthropic.com/v1/messages` via `@anthropic-ai/sdk`
- **AND** uses the model from the resolution precedence chain (flag override → modelMap.haiku → default)
- **AND** returns the generated title
- **AND** no fetch to `apollosai.dev` occurs

#### Scenario: subscription-litellm mode forwards customer-id audit header

- **WHEN** the active account is `subscription-litellm` with a LiteLLM virtual key and `mode.customerId` is `oid-123`
- **AND** a chat is created
- **THEN** `generateChatTitle` calls `${MAIN_VITE_LITELLM_BASE_URL}/v1/messages` via `@anthropic-ai/sdk`
- **AND** the request includes header `x-litellm-customer-id: oid-123`
- **AND** uses `Authorization: Bearer <virtualKey>` via the SDK's `authToken` config

#### Scenario: byok-litellm resolves model from account's modelMap.haiku

- **WHEN** the active account is `byok-litellm` with `modelMap.haiku = "claude-haiku-custom-id"`
- **AND** the `auxAiModel` feature flag is at its default empty-string value
- **THEN** `generateChatTitle` uses `claude-haiku-custom-id` as the SDK model id
- **AND** does NOT use the built-in default `claude-3-5-haiku-latest`

#### Scenario: Explicit auxAiModel flag overrides everything

- **WHEN** `setFlag("auxAiModel", "claude-sonnet-4-5")` has been called
- **AND** the active account is `byok-litellm` with a populated modelMap
- **THEN** `generateChatTitle` uses `claude-sonnet-4-5` (flag wins over modelMap)

#### Scenario: subscription-direct falls through to Ollama

- **WHEN** the active account is `subscription-direct`
- **AND** Ollama is running on `localhost:11434`
- **THEN** `generateChatTitle` uses the existing Ollama fallback
- **AND** no call to `@anthropic-ai/sdk` is made
- **AND** no fetch to `apollosai.dev` occurs

#### Scenario: Every mode falls back silently on provider error

- **WHEN** the chosen provider backend fails (timeout, network error, 5xx, SDK exception)
- **THEN** `generateChatTitle` returns `getFallbackName(userMessage)`
- **AND** exactly ONE warning log line is emitted per failure (no stack trace)

#### Scenario: auxAiEnabled=false forces unconditional fallback

- **WHEN** `getFlag("auxAiEnabled")` returns false
- **AND** a chat is created
- **THEN** `generateChatTitle` returns `getFallbackName(userMessage)` without any provider call

#### Scenario: Zero upstream fetches remain in the chats router

- **WHEN** `src/main/lib/trpc/routers/chats.ts` is scanned for `apollosai\.dev/api/agents`
- **THEN** zero matches are found
- **AND** the `no-apollosai-aux-ai-fetch.test.ts` regression guard passes

### Requirement: F-entries F11 and F12 catalogued with qualified-resolved status

The `docs/enterprise/upstream-features.md` file SHALL contain entries for both upstream call sites surfaced by the 2026-04-13 smoke, marked with the qualified status `✅ RESOLVED (3/4 provider modes) — subscription-direct degrades to Ollama-or-truncated-fallback (acceptable UX)`:

- **F11. Sub-Chat Name Generation** — historical `apollosai.dev/api/agents/sub-chat/generate-name` dependency. Current implementation: provider-aware dispatch in `src/main/lib/aux-ai.ts`. Qualifier: `subscription-direct` users get Ollama-or-truncated-fallback (not the AI-generated title that LiteLLM/BYOK-direct users get).
- **F12. Commit Message Generation** — historical `apollosai.dev/api/agents/generate-commit-message`. Current implementation: same module. Same qualifier.

The "3/4 provider modes" language differentiates these from fully-resolved entries like F5 (auto-update) where ALL users benefit.

#### Scenario: Catalog entries exist with correct status taxonomy

- **WHEN** `docs/enterprise/upstream-features.md` is read
- **THEN** F11 and F12 sections both exist
- **AND** each section's status line contains both `✅ RESOLVED` AND the qualifier `(3/4 provider modes)`
- **AND** each section's "current implementation" paragraph references `src/main/lib/aux-ai.ts`
