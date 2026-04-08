---
name: upstream-boundary-check
description: Use when reading or writing any file under src/renderer/ that calls remoteTrpc.* or fetch(${apiUrl}/...). Verifies the call site is documented in .scratchpad/upstream-features-inventory.md and warns if a new upstream-backend dependency is being introduced without a corresponding F-entry. This skill enforces the enterprise-fork posture documented in CLAUDE.md.
user-invocable: false
---

## Upstream Backend Boundary Check

This repo is the **enterprise fork** of 1Code, being decoupled from the upstream `21st.dev` / `1code.dev` hosted backend. Every call site that touches the upstream backend is a future migration cost. This skill prevents new upstream dependencies from being introduced silently.

## When to fire this skill

- Reading or writing **any file under `src/renderer/`** that contains `remoteTrpc.` or `fetch(${apiUrl}` or `signedFetch("https://21st.dev`
- Reviewing diffs that add such call sites
- Refactoring code in `src/renderer/lib/remote-*.ts`, `src/renderer/features/automations/*`, `src/renderer/features/agents/lib/remote-chat-transport.ts`, `src/main/lib/trpc/routers/sandbox-import.ts`, `src/main/lib/trpc/routers/voice.ts`, or `src/main/lib/trpc/routers/claude-code.ts`

## What to check

### Step 1 — Identify the boundary touch

Run this grep to see what currently exists:

```bash
grep -rn "remoteTrpc\." src/renderer/
grep -rn "fetch(\`\${apiUrl}\|getApiBaseUrl" src/main/ src/renderer/
```

If the file you're touching introduces a NEW boundary call (one not previously in the grep output), continue to Step 2.

### Step 2 — Cross-reference against the inventory

Read `.scratchpad/upstream-features-inventory.md`. The inventory contains 10 catalogued features (F1–F10) with code locations. Check whether the new call site fits inside an existing F-entry.

### Step 3 — Enforce the rule

**If the new call fits an existing F-entry:**
- Update that F-entry's "Code locations" list to include the new call site
- Note in your response that the inventory was updated

**If the new call does NOT fit any existing F-entry:**
- Block the change with a clear message — the user must explicitly authorize a new upstream dependency
- Output:
  ```
  ⚠️  NEW UPSTREAM-BACKEND DEPENDENCY DETECTED

  File: <file>:<line>
  Call: <the remoteTrpc.* or fetch(${apiUrl}/...) line>

  This call site is not documented in .scratchpad/upstream-features-inventory.md.

  Per CLAUDE.md "Upstream Backend Boundary" section, every new remoteTrpc.* call
  becomes a future migration cost. Before introducing this dependency:

  1. Confirm there is no local-only alternative (LiteLLM, local subprocess, etc.)
  2. If the upstream call is required, add a new F-entry to the inventory with:
     - Feature name + priority (P0/P1/P2/P3)
     - Code location (this file:line)
     - What it does today
     - What breaks when upstream is retired
     - Candidate restore approaches
  3. Then re-attempt the change
  ```

## Inventory snapshot (refresh from .scratchpad/upstream-features-inventory.md)

| ID | Feature | Priority | Primary code locations |
|---|---|---|---|
| F1 | Background Agents / cloud sandbox | 🟥 P0 (OAuth) / ⬜ P3 (agents) | `src/main/lib/trpc/routers/sandbox-import.ts`, `src/main/lib/trpc/routers/claude-code.ts:178-220`, `src/renderer/features/agents/lib/remote-chat-transport.ts` |
| F2 | Automations & Inbox | 🟨 P1 | `src/renderer/features/automations/*`, `src/renderer/features/sidebar/agents-sidebar.tsx:1163`, `src/renderer/features/agents/ui/agents-content.tsx:202` |
| F3 | Remote Agent Chats / Teams | 🟨 P1 | `src/renderer/lib/remote-api.ts`, `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx:67` |
| F4 | Voice Transcription (hosted path) | 🟨 P1 | `src/main/lib/trpc/routers/voice.ts:229` |
| F5 | Auto-Update CDN | ⬜ P3 | `src/main/lib/auto-updater.ts:33` |
| F6 | Changelog Display | ⬜ P3 | `src/renderer/features/agents/components/agents-help-popover.tsx:80` |
| F7 | Plugin Marketplace | 🟨 P1 (unconfirmed) | `src/main/lib/trpc/routers/plugins.ts` (needs investigation) |
| F8 | Subscription Tier Gating | 🟨 P1 | `src/main/lib/trpc/routers/voice.ts:90-115`, `src/main/auth-manager.ts` |
| F9 | Live Browser Previews | 🟩 P2 (unconfirmed) | `src/renderer/features/agents/components/preview-setup-hover-card.tsx:77`, `src/renderer/features/agents/main/active-chat.tsx:8664` |
| F10 | PWA Companion | ⬜ P3 | (not in this repo) |

## Why this skill exists

Before this skill, the only way to enforce the upstream-boundary discipline was manual code review against the inventory. The inventory itself can drift if new call sites are added without updating it. This skill closes that loop by intercepting reads/writes to the relevant files and forcing a cross-reference check **before** the change lands.

## Related artifacts

- `CLAUDE.md` "Upstream Backend Boundary" section — the canonical reference
- `.scratchpad/upstream-features-inventory.md` — the working catalog
- `.scratchpad/auth-strategy-envoy-gateway.md` and `.scratchpad/enterprise-auth-integration-strategy.md` — the migration plans this skill supports
