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
- `tsgo` (Go-based checker) used instead of `tsc` — faster but may have subtle differences

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

## No Formatter/Linter
- No Prettier, ESLint, or Biome configured
- `bun run ts:check` (tsgo) is the only automated quality gate
- No test framework configured
