---
name: verify-strategy-compliance
description: Background knowledge for AI agents before editing any file that handles authentication tokens or spawn environment variables in the 1Code enterprise fork. Triggers when touching src/main/lib/trpc/routers/claude.ts, claude-code.ts, claude/env.ts, feature-flags.ts, or claude-token.ts. Reminds the agent to consult the frozen Envoy Gateway strategy doc (auth-strategy-envoy-gateway.md v2.1) sections that impose hard rules on credential handling.
user-invocable: false
---

# Verify Strategy Compliance (Background Knowledge)

This skill is Claude-only. It activates when the agent is about to edit, write, or refactor any file in the 1Code enterprise fork that handles authentication tokens, spawn environment variables, or credential storage.

## When this skill applies

Any Edit, Write, or file-level refactor touching:

- `src/main/lib/trpc/routers/claude.ts` (the Claude Agent SDK spawn site, lines ~1150 for `buildClaudeEnv`, ~1450 for env-var injection)
- `src/main/lib/trpc/routers/claude-code.ts` (the Claude Code binary/OAuth management router)
- `src/main/lib/claude/env.ts` (environment variable assembly for spawned Claude subprocesses)
- `src/main/lib/feature-flags.ts` (feature flag store; credentials must NOT land here per §4.9)
- `src/main/lib/claude-token.ts` (any token-level helper)
- Any new file added under `src/main/lib/trpc/routers/` that handles `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN_FILE`
- Any new Drizzle table handling credentials (must co-locate with `anthropicAccounts.oauthToken` encryption pattern)

## Hard rules the agent MUST verify before proceeding

### Rule 1 — Env-var bearer injection is forbidden (strategy v2.1 §4.9)

**Do NOT** write code like:

```ts
finalEnv.ANTHROPIC_AUTH_TOKEN = authToken;
finalEnv.ANTHROPIC_CUSTOM_HEADERS = "Authorization: Bearer " + token;
```

Any same-UID process on the host can read the spawned subprocess environment via:

- Linux: `cat /proc/<pid>/environ`
- macOS: `ps -E <pid>` or `ps eww <pid>`
- Windows: `NtQueryInformationProcess` with `PROCESS_QUERY_INFORMATION`

Attack surface includes every npm postinstall hook, VS Code extension host, MCP server subprocess, other dev-tool daemon running under the user's UID. **Read `.scratchpad/auth-strategy-envoy-gateway.md` §4.9** for the full threat model.

### Rule 2 — Use the token-file pattern from §5.4

The mandated alternative is `applyEnterpriseAuth()` helper per strategy v2.1 §5.4:

1. Write the bearer token to a per-spawn tmpfile with mode `0600` (owner read/write only)
2. Set `finalEnv.ANTHROPIC_AUTH_TOKEN_FILE = "/path/to/tmpfile"` (NOT the token itself)
3. After the SDK confirms the file was read, `fs.unlink()` the tmpfile
4. Cleanup must be guaranteed even on crash (use `process.on('exit', ...)`)

**CRITICAL unknown**: verify Claude CLI `2.1.96` (currently pinned) supports `ANTHROPIC_AUTH_TOKEN_FILE` BEFORE designing against it. Test with `claude --version` and inspect the CLI's env-var documentation. If unsupported, do not regress to env-var injection — document a blocker and stop.

### Rule 3 — Credentials do NOT belong in `feature_flag_overrides`

The `feature_flag_overrides.value` column is plain `text("value").notNull()` with no encryption — see `src/main/lib/db/schema/index.ts:140-148`. Contrast with `anthropicAccounts.oauthToken` (line 108) and `claudeCodeCredentials.oauthToken` (line 99), both explicitly commented "Encrypted with safeStorage".

`setFlag` at `src/main/lib/feature-flags.ts:153-184` only does `JSON.stringify` — no encryption hook. `getAllFlagsWithSources()` at line 208-253 returns all values for "admin/debug inspection" with no redaction.

**Do NOT** add credential-carrying flag keys. If a design requires storing a bearer token persistently, options are:

1. Extend `anthropicAccounts` (already safeStorage-encrypted) with a discriminator column
2. Add a new dedicated table (e.g., `litellm_credentials`) with safeStorage-encrypted columns mirroring `anthropicAccounts`
3. Add an encryption hook to `setFlag` via a `sensitive: true` marker in `FLAG_DEFAULTS` + hardcode `getAllFlagsWithSources` to redact sensitive values

This decision is deferred — ask the user before picking an option, do not decide unilaterally.

### Rule 4 — §3.1 cluster lock-down is a blocking prerequisite for live traffic

Any code that sends production traffic to LiteLLM via Envoy Gateway depends on cluster-side mitigations in the Talos repo:

- `CiliumNetworkPolicy` restricting LiteLLM port 4000 to Envoy Gateway pods only
- LiteLLM `HTTPRoute` with `RequestHeaderModifier` stripping inbound `x-user-*` headers

Without these, any pod in the `ai` namespace can forge `x-user-oid` headers and impersonate any user (LiteLLM OSS cannot validate JWTs — the JWT-Auth feature is Enterprise-only). **Verify these cluster-side mitigations are in place** before shipping app-side code that routes through Envoy → LiteLLM.

See `.scratchpad/auth-strategy-envoy-gateway.md` §3.1.

### Rule 5 — LiteLLM OSS feature matrix constraints

LiteLLM OSS edition does NOT support:

- **JWT-Auth** — Enterprise-only. Envoy Gateway must validate JWTs and forward a virtual LiteLLM key.
- **SSO for Admin UI** — Enterprise-only, capped at 5 users in OSS.
- **Key rotation with grace period** — Enterprise-only. Manual revoke + recreate works but causes in-flight session interruption.
- **`custom_auth` + virtual keys combined** — Enterprise-only since v1.72.2. Can use one OR the other in OSS, not both.

`forward_llm_provider_auth_headers: true` and `forward_client_headers_to_llm_api: true` ARE OSS features, but shipping them requires a separate security review of log exposure (bearer tokens can land in SpendLogs / Langfuse / Datadog / any callback that captures headers).

## Verification checklist the agent must complete

Before writing any code for an auth-touching edit, the agent MUST answer:

- [ ] Did I read `.scratchpad/auth-strategy-envoy-gateway.md` §3.1, §4.9, §5.4, and §6?
- [ ] Does my edit avoid setting `ANTHROPIC_AUTH_TOKEN=<bearer>` directly in `finalEnv`?
- [ ] Does my edit avoid setting `ANTHROPIC_CUSTOM_HEADERS=<...Bearer...>` directly in `finalEnv`?
- [ ] If my edit DOES need to pass a bearer to Claude, am I using the `ANTHROPIC_AUTH_TOKEN_FILE` + tmpfile pattern?
- [ ] Did I verify Claude CLI `2.1.96` (pinned in `package.json` `claude:download`) supports `ANTHROPIC_AUTH_TOKEN_FILE`?
- [ ] Does my edit avoid storing credentials in `feature_flag_overrides`?
- [ ] If my edit adds a new feature flag that stores anything sensitive, did I add a `sensitive: true` marker AND verify `getAllFlagsWithSources` redacts it?
- [ ] Am I reusing the existing `customConfig`/`buildClaudeEnv({ customEnv })` substrate at `claude.ts:1151-1158` instead of adding a second parallel injection block?
- [ ] For any Envoy Gateway routing, did I confirm §3.1 cluster-side mitigations are in place?
- [ ] Did I check whether my edit falls under a Phase 0 hard gate's exact text in §6, and am I staying within that scope (not expanding it)?

If any answer is "no," stop and research the gap before writing production code.

## Relevant file references

- `.scratchpad/auth-strategy-envoy-gateway.md` — the frozen v2.1 strategy doc (do NOT edit, read-only reference)
- `.scratchpad/forwardaccesstoken-smoke-test.md` — empirical Envoy Gateway smoke test (Outcome A PASS)
- `.full-review/envoy-gateway-review/05-final-report.md` — prior comprehensive review with resolution status
- `src/main/lib/trpc/routers/claude.ts:826-832` — existing `customConfig` Zod schema
- `src/main/lib/trpc/routers/claude.ts:1151-1158` — existing `buildClaudeEnv({ customEnv })` substrate
- `src/main/lib/trpc/routers/claude.ts:1429-1437` — existing `hasExistingApiConfig` precedence check
- `src/main/lib/claude/env.ts` — `buildClaudeEnv` implementation (this is where `applyEnterpriseAuth()` belongs)
- `src/main/lib/db/schema/index.ts:99-127` — reference encryption pattern for `anthropicAccounts`/`claudeCodeCredentials`
- `src/main/lib/feature-flags.ts:153-253` — `setFlag` + `getAllFlagsWithSources` (no encryption hook, use carefully)

## Background on why this skill exists

This skill was created in the session that produced the Gate #8 4-reviewer audit (2026-04-08). The audit found 6 Critical and 6 High findings against a Gate #8 plan that silently regressed strategy v2.1 §4.9, stored credentials in unencrypted feature flags, created a downgrade attack surface via silent misconfig fallback, and duplicated an existing env-var injection substrate — all because the plan author (Claude in a prior session) did not re-read the strategy doc's hard rules before designing. This skill codifies those rules as checkable background knowledge so the same mistake does not repeat.
