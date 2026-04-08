# Task Completion Checklist

When a task is completed, run through these steps:

## Required
1. **Dev build**: `bun run build` — Primary validation gate (must pass)
2. **Type check**: `bun run ts:check` — Stricter than build (tsgo reveals pre-existing errors the bundler masks)
   - Note: build uses esbuild (no type checking); ts:check uses tsgo (full check)
   - Current baseline: 104 pre-existing errors; only fail if count increases

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
11. Only stage files YOU modified — exclude pre-existing lockfile/package.json drift from parallel sessions

## Dependency Changes
- `bun audit` — Check for known vulnerabilities
- `bun outdated` — List outdated packages
- `bun update` — Semver-safe updates
- Research before major bumps; check peer dep constraints (Vite 6.x, Tailwind 3.x, shiki 3.x are pinned)
