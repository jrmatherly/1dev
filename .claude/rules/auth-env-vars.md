---
paths:
  - "src/main/**/*auth*.ts"
  - "src/main/**/*claude*.ts"
  - "src/main/**/*codex*.ts"
  - "src/main/**/*enterprise*.ts"
---

# HARD RULE: Never inject bearer tokens via environment variables

This is a **hard rule** for any auth code that touches Claude or Codex subprocess spawn environment variables.

**Before writing or modifying any such code, read `docs/enterprise/auth-strategy.md` §4.9 and §5.4 FIRST.**

## Rule

- **DO NOT** manually set `ANTHROPIC_AUTH_TOKEN` in env — use `applyEnterpriseAuth()` in `src/main/lib/claude/env.ts`, which acquires a fresh token via `acquireTokenSilent()` and sets it authoritatively after the `STRIPPED_ENV_KEYS` pass.
- **DO** keep `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_AUTH_TOKEN_FILE` in `STRIPPED_ENV_KEYS_BASE` to prevent shell-inherited values from leaking.
- **DO NOT** use `ANTHROPIC_AUTH_TOKEN_FILE` — Claude CLI 2.1.96 does not support it. The FD-based `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` is the documented upgrade path when the CLI pin is bumped.

## Why

Co-resident processes on the same machine can read another process's environment variables:
- **Linux**: `/proc/<pid>/environ`
- **macOS**: `ps eww`
- **Windows**: `NtQueryInformationProcess`

Mitigations for env-var token exposure:
1. `ANTHROPIC_AUTH_TOKEN` is in `STRIPPED_ENV_KEYS_BASE` — only `applyEnterpriseAuth()` sets it
2. Entra access tokens expire in 60-90 minutes, limiting the exposure window
3. Token is acquired fresh via `acquireTokenSilent()` before each spawn — no long-lived cached value
4. Future: `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD-based) eliminates env-var exposure entirely

## The pattern

```typescript
// In src/main/lib/claude/env.ts — called at the end of buildClaudeEnv()
export async function applyEnterpriseAuth(
  env: Record<string, string>,
): Promise<Record<string, string>>
// Sets env.ANTHROPIC_AUTH_TOKEN and env.ANTHROPIC_BASE_URL when enterprise flag is on
```

## Related cluster prerequisite

`docs/enterprise/auth-strategy.md` §3.1 cluster lock-down (CiliumNetworkPolicy + HTTPRoute header strip) is a **blocking prerequisite** for any code that sends live traffic to LiteLLM via Envoy Gateway. Do not write code that would break if §3.1 is not yet deployed.

## Background

- Canonical doc: `docs/enterprise/auth-strategy.md`
- Module: `src/main/lib/enterprise-auth.ts`
- Spec: `openspec/specs/enterprise-auth/spec.md`
