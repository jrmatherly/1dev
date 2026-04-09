---
title: Upstream Backend Boundary
icon: arrow-left-right
---

# Upstream Backend Boundary {subtitle="Rules for remoteTrpc and fetch(apiUrl) call sites"}

The enterprise fork is being decoupled from the upstream `1code.dev` hosted backend. Two communication channels connect the renderer to the upstream:

## Channel 1: `remoteTrpc.*`

**Location:** `src/renderer/lib/remote-trpc.ts`

The typed tRPC client uses `signedFetch` IPC to attach the desktop auth token. The type contract lives in `src/renderer/lib/remote-app-router.ts` (a `TRPCBuiltRouter` stub reverse-engineered from call-site usage).

Default base URL: `https://apollosai.dev` (overridable via `desktopApi.getApiBaseUrl()`).

**Inventory command:**
```bash
grep -rn "remoteTrpc\." src/renderer/
```

## Channel 2: Raw `fetch(${apiUrl}/...)`

Used where tRPC is not on the upstream path. Known sites:

| File | Purpose |
|------|---------|
| `voice.ts` | Hosted voice transcription |
| `sandbox-import.ts` | Sandbox import flow |
| `claude-code.ts` | OAuth flow (P0 hidden dep — Gate #8) |
| `agents-help-popover.tsx` | Changelog fetch |

**Inventory command:**
```bash
grep -rn "fetch(\`\${apiUrl}\|fetch(\`\${API_BASE}\|getApiBaseUrl" src/main/ src/renderer/
```

## Rules

1. **Do not introduce new `remoteTrpc.*` call sites** without documenting them in the [Upstream Features Catalog](../enterprise/upstream-features.md). Every upstream call site is future migration cost.
2. **Any feature touching `remoteTrpc.foo.bar` will break when upstream is retired.** Prefer local tRPC routers for new functionality.
3. **The `upstream-boundary-check` skill** (`.claude/skills/upstream-boundary-check/`) enforces this rule on every Edit/Write to files under `src/renderer/`.
4. **`mock-api.ts` is DEPRECATED** but still imported by 6 files in `features/agents/`. Do not delete without migrating call sites first. See the `retire-mock-api-translator` OpenSpec change for the migration plan.

## F1-F10 Catalog

See the [Upstream Features Catalog](../enterprise/upstream-features.md) for the full per-feature restoration roadmap.

## Type Contract

`src/renderer/lib/remote-app-router.ts` defines the typed `AppRouter` stub — 5 router namespaces with 22 unique procedures. `src/renderer/lib/remote-types.ts` breaks the circular dependency between the typed stub and the tRPC client setup.
