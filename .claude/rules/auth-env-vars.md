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

- **DO NOT** set `ANTHROPIC_AUTH_TOKEN=<bearer>` or any other bearer-token-carrying env var when spawning Claude CLI, Codex CLI, or any subprocess.
- **DO** use the mandated pattern: `applyEnterpriseAuth()` writes a `0600` tmpfile and passes `ANTHROPIC_AUTH_TOKEN_FILE=/path/to/tmpfile` to the subprocess.
- **DO** verify `ANTHROPIC_AUTH_TOKEN_FILE` support against the pinned Claude CLI version (currently 2.1.96) before designing against it.

## Why

Co-resident processes on the same machine can read another process's environment variables:
- **Linux**: `/proc/<pid>/environ`
- **macOS**: `ps eww`
- **Windows**: `NtQueryInformationProcess`

A bearer token in `ANTHROPIC_AUTH_TOKEN` is therefore equivalent to plaintext-on-disk for any attacker with local process listing. The `ANTHROPIC_AUTH_TOKEN_FILE` pattern forces the attacker to additionally compromise a `0600`-protected tmpfile owned by our process.

## The full pattern

```typescript
import { applyEnterpriseAuth } from "src/main/lib/enterprise-auth"

const env = await applyEnterpriseAuth({
  token: bearerToken,
  baseEnv: process.env,
})
// env now has ANTHROPIC_AUTH_TOKEN_FILE=/tmp/..., NOT ANTHROPIC_AUTH_TOKEN

spawn(claudeBinary, args, { env })
```

## Related cluster prerequisite

`docs/enterprise/auth-strategy.md` §3.1 cluster lock-down (CiliumNetworkPolicy + HTTPRoute header strip) is a **blocking prerequisite** for any code that sends live traffic to LiteLLM via Envoy Gateway. Do not write code that would break if §3.1 is not yet deployed.

## Background

- Canonical doc: `docs/enterprise/auth-strategy.md`
- Module: `src/main/lib/enterprise-auth.ts`
- Spec: `openspec/specs/enterprise-auth/spec.md`
