---
paths:
  - "src/renderer/**/*.ts"
  - "src/renderer/**/*.tsx"
---

# Upstream backend boundary — `remoteTrpc.*` and `fetch(${apiUrl}/...)`

This repo is the **enterprise fork** of upstream 1Code. It is being decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure. Certain call sites in the renderer still reach the upstream backend — these are tracked as "F-entries" (F1-F10) in `docs/enterprise/upstream-features.md`.

## Rule

When editing any file under `src/renderer/` that calls `remoteTrpc.*` or `fetch(\`${apiUrl}/...\`)`:

1. **Before adding a new upstream call**, verify the F-entry it belongs to in `docs/enterprise/upstream-features.md`. If no F-entry covers it, the call must either:
   - Route to a local tRPC router via `trpc.*` instead, OR
   - Be paired with a new F-entry added to the catalog + an OpenSpec change documenting the decision
2. **Do NOT migrate F1-boundary call sites** (specifically `archive-popover.tsx:351` and `agents-sidebar.tsx:2077-2078`) to camelCase timestamps. They read `chat.updated_at` from `remoteArchivedChats` (an upstream DTO) and belong to the F1 restoration roadmap.
3. **The `docs-drift-check` skill** flags missing F-entry coverage — run it after adding any new upstream call.

## What counts as an upstream call

- `remoteTrpc.foo.bar` — typed tRPC client for the upstream backend (`src/renderer/lib/remote-trpc.ts`)
- `fetch(\`${apiUrl}/...\`)` — raw HTTP to the upstream backend (`src/renderer/lib/remote-api.ts` etc.)
- Reads from the upstream backend's DTOs (snake_case timestamps, `sandbox_id`, etc.)

## What does NOT count as an upstream call

- `trpc.*` — local tRPC client (main-process routers)
- Reads from Drizzle schema types (camelCase timestamps)
- Mock API calls (`mock-api.ts`) — these are fossil code being migrated; see the mock-api deprecation note in CLAUDE.md

## sandbox_id specifics

`sandbox_id` in `agents-content.tsx`, `agent-preview.tsx`, `mock-api.ts`, and `agents-sidebar.tsx` refers to the E2B browser sandbox for the **live preview feature (F9)**. This feature is dead UI on desktop (gated on `sandbox_id` which `mock-api.ts:46` hard-codes to `null`) and will be rebuilt as a Phase 2 greenfield feature using `src/main/lib/terminal/port-manager.ts`.

The former Claude Code OAuth flow that also used `sandbox_id` was removed in Phase 0 gate #8 — that's unrelated to F9.

## Related skill

Invoke the `upstream-boundary-check` skill (via `/upstream-boundary-check`) after editing any file that matches this rule's `paths:` — it enforces the F-entry catalog coverage.

## Background

- Canonical doc: `docs/architecture/upstream-boundary.md`
- Catalog: `docs/enterprise/upstream-features.md`
- Refresh the inventory: `grep -rn "remoteTrpc\." src/renderer/`
