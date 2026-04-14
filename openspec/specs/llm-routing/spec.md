# llm-routing Specification

## Purpose

Decouple app-to-user authentication (Microsoft Entra ID) from CLI-to-Anthropic authentication (Claude OAuth or BYOK API key) by introducing an explicit account-type × routing-mode model. The routing layer SHALL determine, per active account, whether the Claude CLI is spawned with an OAuth token or API key, and whether requests route directly to `api.anthropic.com` or through the self-hosted LiteLLM proxy at `MAIN_VITE_LITELLM_BASE_URL`. This eliminates the failure mode where an Entra JWT is passed verbatim as `ANTHROPIC_AUTH_TOKEN` and rejected by Anthropic, and provides the foundation for team-scoped LiteLLM virtual keys, audit logging, and rate-limit enforcement at the edge.

## Requirements
### Requirement: Deterministic spawn-env derivation from ProviderMode

The system SHALL provide a pure function `deriveClaudeSpawnEnv(mode: ProviderMode, liteLlmBaseUrl?: string): Record<string, string>` in `src/main/lib/claude/spawn-env.ts` that is the ONLY code path that assembles Claude CLI authentication environment variables.

The function SHALL accept a discriminated-union `ProviderMode` with four mutually-exclusive branches:

- `{ kind: "subscription-direct"; oauthToken: string }`
- `{ kind: "subscription-litellm"; oauthToken: string; virtualKey: string; customerId?: string }`
- `{ kind: "byok-direct"; apiKey: string }`
- `{ kind: "byok-litellm"; virtualKey: string; customerId?: string; modelMap: { sonnet: string; haiku: string; opus: string } }`

The function SHALL be synchronous, side-effect-free, and deterministic (same input produces identical output).

#### Scenario: subscription-direct returns only CLAUDE_CODE_OAUTH_TOKEN

- **WHEN** `deriveClaudeSpawnEnv({ kind: "subscription-direct", oauthToken: "sk-ant-oat01-abc" })` is called
- **THEN** the returned record contains key `CLAUDE_CODE_OAUTH_TOKEN` with value `"sk-ant-oat01-abc"`
- **AND** the returned record does NOT contain `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or `ANTHROPIC_BASE_URL`

#### Scenario: subscription-litellm returns OAuth token plus LiteLLM routing

- **WHEN** `deriveClaudeSpawnEnv({ kind: "subscription-litellm", oauthToken: "sk-ant-oat01-abc", virtualKey: "sk-litellm-xyz", customerId: "oid-123" }, "https://llms.example.com")` is called
- **THEN** the returned record contains `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-abc`, `ANTHROPIC_BASE_URL=https://llms.example.com`, `ENABLE_TOOL_SEARCH=true`
- **AND** the returned record contains `ANTHROPIC_CUSTOM_HEADERS` with the two lines `x-litellm-api-key: Bearer sk-litellm-xyz` and `x-litellm-customer-id: oid-123` joined by `\n`
- **AND** the returned record does NOT contain `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`

#### Scenario: byok-direct returns only ANTHROPIC_API_KEY

- **WHEN** `deriveClaudeSpawnEnv({ kind: "byok-direct", apiKey: "sk-ant-api03-def" })` is called
- **THEN** the returned record contains key `ANTHROPIC_API_KEY` with value `"sk-ant-api03-def"`
- **AND** the returned record does NOT contain `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, or `ANTHROPIC_BASE_URL`

#### Scenario: byok-litellm returns virtual key via ANTHROPIC_AUTH_TOKEN plus model map

- **WHEN** `deriveClaudeSpawnEnv({ kind: "byok-litellm", virtualKey: "sk-litellm-xyz", customerId: "oid-123", modelMap: { sonnet: "claude-sonnet-4", haiku: "claude-haiku-4", opus: "claude-opus-4" } }, "https://llms.example.com")` is called
- **THEN** the returned record contains `ANTHROPIC_BASE_URL=https://llms.example.com`, `ANTHROPIC_AUTH_TOKEN=sk-litellm-xyz`, `ENABLE_TOOL_SEARCH=true`
- **AND** the returned record contains `ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4`, `ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4`, `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4`
- **AND** the returned record contains `ANTHROPIC_CUSTOM_HEADERS` containing `x-litellm-customer-id: oid-123`
- **AND** the returned record does NOT contain `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`

#### Scenario: LiteLLM branches throw when baseUrl is missing

- **WHEN** `deriveClaudeSpawnEnv({ kind: "subscription-litellm", ... })` is called with `liteLlmBaseUrl` undefined
- **THEN** the function throws an Error whose message includes `MAIN_VITE_LITELLM_BASE_URL`

### Requirement: Spawn-env mutual-exclusivity invariants

The following env var pairs SHALL never both be set in the same spawn environment:

- `CLAUDE_CODE_OAUTH_TOKEN` AND `ANTHROPIC_AUTH_TOKEN`
- `CLAUDE_CODE_OAUTH_TOKEN` AND `ANTHROPIC_API_KEY`
- `ANTHROPIC_API_KEY` AND `ANTHROPIC_AUTH_TOKEN`

#### Scenario: Mutually exclusive env vars never coexist across all ProviderMode branches

- **WHEN** `deriveClaudeSpawnEnv` is called with each of the four `ProviderMode` kinds
- **THEN** for every resulting record, at most one of `{CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN}` is present

### Requirement: ALLOW_DIRECT_ANTHROPIC gates direct-to-Anthropic routing in the UI

The Settings → Models UI SHALL expose direct-to-Anthropic routing (`subscription-direct` and `byok-direct` kinds) only when `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true` in the runtime environment. When the flag is unset or `false`, the UI SHALL silently lock both account types to their LiteLLM routing variants.

#### Scenario: Flag true exposes direct routing option in wizard

- **WHEN** `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true` at app startup
- **AND** a user opens the "Add Account" wizard and selects account type
- **THEN** step 2 of the wizard shows a routing-mode selector with both "Direct to Anthropic" and "Through LiteLLM" options

#### Scenario: Flag false hides direct routing

- **WHEN** `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` is unset
- **AND** a user opens the "Add Account" wizard and selects account type
- **THEN** the wizard skips step 2 entirely and proceeds directly to credential entry in LiteLLM mode

### Requirement: Environment variable MAIN_VITE_LITELLM_BASE_URL

The system SHALL read the LiteLLM proxy base URL from the `MAIN_VITE_LITELLM_BASE_URL` environment variable. When any profile's `routingMode` is `litellm`, `MAIN_VITE_LITELLM_BASE_URL` SHALL be required; absence SHALL surface a blocking error in the UI preventing chat send and SHALL be logged as `[spawn-env] missing MAIN_VITE_LITELLM_BASE_URL` in the main process.

#### Scenario: Missing base URL blocks chat send in LiteLLM mode

- **WHEN** a user attempts to send a chat via a profile with `routingMode=litellm`
- **AND** `MAIN_VITE_LITELLM_BASE_URL` is unset
- **THEN** the chat send is blocked with a UI-visible error message referencing the missing env var
- **AND** the main process logs `[spawn-env] missing MAIN_VITE_LITELLM_BASE_URL`

#### Scenario: Base URL replaces legacy LITELLM_PROXY_URL

- **WHEN** the codebase is scanned for references
- **THEN** no reference to `LITELLM_PROXY_URL` remains in main-process code under `src/main/`

### Requirement: LiteLLM model enumeration for BYOK users

The system SHALL provide a tRPC procedure `litellmModels.listUserModels` that accepts a `virtualKey: string` input and returns the list of models accessible to that key by calling `GET ${MAIN_VITE_LITELLM_BASE_URL}/v1/models` with `Authorization: Bearer <virtualKey>`. The renderer SHALL call this procedure during the BYOK-via-LiteLLM wizard and auto-suggest Sonnet/Haiku/Opus slot mappings using regex matches on returned model names (`/sonnet/i`, `/haiku/i`, `/opus/i`). Users SHALL be able to override any slot.

#### Scenario: Successful model enumeration auto-maps slots

- **WHEN** `listUserModels` is called with a valid virtual key
- **AND** LiteLLM returns `[{id: "claude-sonnet-4"}, {id: "claude-haiku-4"}, {id: "claude-opus-4"}, {id: "gpt-4"}]`
- **THEN** the wizard pre-fills Sonnet slot with `claude-sonnet-4`, Haiku with `claude-haiku-4`, Opus with `claude-opus-4`
- **AND** each slot has a dropdown editable with all four returned model ids

#### Scenario: Enumeration failure falls back to manual entry

- **WHEN** `listUserModels` throws (network, 401, 500)
- **THEN** the wizard shows the error message inline
- **AND** the wizard exposes three plain text inputs for Sonnet/Haiku/Opus values
- **AND** the user can complete account creation by typing model names manually

### Requirement: Subscription-aware model picker access control

When an end user is signed in with enterprise auth (`enterpriseAuthEnabled === true`) AND their currently active `anthropic_accounts` row has `accountType === "claude-subscription"`, the renderer SHALL NOT expose the "Add Models" footer affordance of the agent model selector. The affordance re-appears when the active account is `byok` or when enterprise auth is not enabled.

This requirement exists because enterprise deployments manage provider credentials centrally (LiteLLM virtual keys provisioned via `1code-api`); end users on a managed Claude subscription have no need to add their own provider credentials from within the app, and doing so would bypass the central audit, rate-limiting, and team-allowlist enforcement point.

The rule SHALL be enforced at the renderer via a boolean gate `canAddModels = !(activeAccount.accountType === "claude-subscription" && enterpriseAuthEnabled)` computed from the `trpc.anthropicAccounts.getActive` query. `getActive` MUST return `accountType` as part of its select shape to enable this check; the legacy-credential fallback branch MUST return `accountType: "claude-subscription"` so the gate resolves uniformly.

Other picker behavior — Codex model visibility, Ollama offline fallback, thinking toggles, `litellmModels` wizard, cross-provider confirmation dialog — SHALL remain unchanged by this rule.

#### Scenario: End user on Claude-subscription sees no Add Models footer

- **GIVEN** the app is running with `enterpriseAuthEnabled === true`
- **AND** the active `anthropic_accounts` row has `accountType === "claude-subscription"`
- **WHEN** the user opens the agent model selector dropdown in the chat composer
- **THEN** the dropdown renders Claude models plus (optionally) Codex models
- **AND** the "Add Models" footer button is NOT rendered

#### Scenario: End user on BYOK sees the Add Models footer

- **GIVEN** the app is running with `enterpriseAuthEnabled === true`
- **AND** the active `anthropic_accounts` row has `accountType === "byok"`
- **WHEN** the user opens the agent model selector dropdown
- **THEN** the "Add Models" footer button IS rendered
- **AND** clicking it opens the Settings → Models tab

#### Scenario: Dev-bypass session sees Add Models footer unchanged

- **GIVEN** the app is running with `MAIN_VITE_DEV_BYPASS_AUTH=true` so the renderer resolves `enterpriseAuthEnabled === false`
- **AND** any `anthropic_accounts` row is active
- **WHEN** the user opens the agent model selector dropdown
- **THEN** the "Add Models" footer button IS rendered (the rule gates only enterprise-auth sessions)

#### Scenario: Active-account query returns accountType

- **WHEN** `trpc.anthropicAccounts.getActive` is called
- **THEN** the returned shape includes `accountType: "claude-subscription" | "byok"`
- **AND** includes `routingMode: "direct" | "litellm"`
- **AND** the legacy-credential fallback branch returns `accountType: "claude-subscription"` and `routingMode: "direct"` (the only historically valid combination for pre-migration data)

### Requirement: Regression guards for spawn-env invariants

The repository SHALL include three bun:test regression guards enforcing the invariants:

1. `tests/regression/spawn-env-invariants.test.ts` — calls `deriveClaudeSpawnEnv` for every `ProviderMode` branch and asserts mutual-exclusivity of credential env vars.
2. `tests/regression/no-entra-in-anthropic-auth-token.test.ts` — reads `src/main/lib/claude/env.ts` source and asserts the body of `applyEnterpriseAuth` contains no assignment to `env.ANTHROPIC_AUTH_TOKEN`.
3. `tests/regression/no-legacy-litellm-proxy-url.test.ts` — scans `src/main/` and asserts no reference to `LITELLM_PROXY_URL` (the old env var name) remains.

#### Scenario: Invariants guard catches accidental dual-set

- **WHEN** a developer modifies `deriveClaudeSpawnEnv` so that `subscription-direct` also sets `ANTHROPIC_AUTH_TOKEN`
- **AND** `bun test tests/regression/spawn-env-invariants.test.ts` is run
- **THEN** the test fails with a diagnostic referencing the offending branch

#### Scenario: Entra-in-AUTH_TOKEN guard catches regression in applyEnterpriseAuth

- **WHEN** a developer adds `env.ANTHROPIC_AUTH_TOKEN = token` inside `applyEnterpriseAuth` in `src/main/lib/claude/env.ts`
- **AND** `bun test tests/regression/no-entra-in-anthropic-auth-token.test.ts` is run
- **THEN** the test fails referencing the forbidden line

