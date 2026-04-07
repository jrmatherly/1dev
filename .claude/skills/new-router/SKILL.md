---
name: new-router
description: Scaffold a new tRPC router with proper types, imports, and registration in the app router
disable-model-invocation: true
---

## Scaffold a New tRPC Router

Ask the user for the router name if not provided as an argument.

### Steps

1. **Read the pattern**: Read `src/main/lib/trpc/routers/projects.ts` as a template for a simple CRUD router.

2. **Create the router file**: Create `src/main/lib/trpc/routers/{name}.ts` following the pattern:
   - Import `publicProcedure` and `router` from `../index`
   - Import `z` from `zod` for input validation
   - Export a `{name}Router` const using the `router()` function
   - Add placeholder procedures based on the user's description

3. **Register in index**: Edit `src/main/lib/trpc/routers/index.ts`:
   - Add import: `import { {name}Router } from "./{name}"`
   - Add to the `router({})` call inside `createAppRouter`: `{name}: {name}Router,`

4. **Confirm**: Run `bun run ts:check` to verify the new router compiles.

### Router Registration Pattern

```typescript
// In src/main/lib/trpc/routers/index.ts
import { {name}Router } from "./{name}";

// Inside createAppRouter():
return router({
  // ... existing routers
  {name}: {name}Router,
});
```

The `AppRouter` type is automatically inferred from the return type of `createAppRouter`, so the client gets type safety with no extra work.
