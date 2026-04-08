# Code Style and Conventions

## File Naming
- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## TypeScript
- Strict mode via tsconfig.json
- Zod for runtime validation on tRPC procedure inputs
- Type inference preferred over explicit annotations where possible
- `tsgo` (Go-based checker) used instead of `tsc` — faster but has known gaps with mapped-type recursion; fall back to `tsc` for tricky type errors

## Security Patterns to Enforce
- Never log token previews or credential fragments (see prior bug at `claude.ts:200-204`/`:244-248`)
- Use `event.senderFrame.url` (Electron 28+), not `event.sender.getURL()`, in IPC sender validation
- Delete dead IPC handlers — `auth:get-token` was a CVSS 9.0 dead-code path
- All binary downloads must verify SHA256 checksums (supply chain hardening)
- MCP server URLs must go through `src/main/lib/trpc/schemas/mcp-url.ts` (SSRF-safe validation)
- Do not introduce new `remoteTrpc.*` call sites without flagging them in `.scratchpad/upstream-features-inventory.md` — every one becomes a future migration cost

## State Management Rules
- **Jotai**: UI state (selected chat, sidebar open, preview settings)
- **Zustand**: Persisted state (sub-chat tabs, pinned items — localStorage)
- **React Query via tRPC**: Server state (auto-caching, refetch)
- Never duplicate server state in Jotai/Zustand

## IPC Communication
- All main↔renderer communication via tRPC (trpc-electron)
- No raw IPC calls — always use tRPC routers
- Preload exposes `window.desktopApi` for native features only (window controls, clipboard, notifications)

## Component Patterns
- Radix UI primitives for accessible components
- `cn()` utility with tailwind-merge for class merging
- class-variance-authority (CVA) for component variants
- Motion (framer-motion) for animations

## Quality Gates (no test framework, no formatter, no linter)
- No Prettier, ESLint, or Biome configured
- No Jest, Vitest, or Playwright configured
- **Two automated quality gates** — both required before submitting a PR:
  1. `bun run ts:check` (tsgo, stricter, catches type errors)
  2. `bun run build` (electron-vite, validates packaging pipeline)
- Neither gate is a superset of the other — run both
