# Task Completion Checklist

When a task is completed, run through these steps:

## Required
1. **Type check**: `bun run ts:check` — Verify no TypeScript errors introduced
2. **Dev build**: `bun run build` — Ensure the app compiles successfully

## If Schema Changed
3. **Generate migration**: `bun run db:generate` — Create migration from schema changes
4. Verify migration file in `drizzle/` directory

## If New tRPC Router Added
5. Register in `src/main/lib/trpc/routers/index.ts`
6. Type check confirms `AppRouter` type updates automatically

## If UI Changed
7. Run `bun run dev` and manually verify the change renders correctly
8. Check for accessibility: keyboard navigation, aria labels on Radix components

## Before Committing
9. No `.env` files or secrets in staged changes
10. No `console.log` debugging statements left behind
11. Check that lock files (`bun.lock`) haven't been accidentally modified
