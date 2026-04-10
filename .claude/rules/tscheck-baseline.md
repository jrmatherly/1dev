---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# tsgo baseline — the baseline file is load-bearing

This repo uses **`tsgo`** (Go-based TS checker, `@typescript/native-preview`) instead of `tsc` for `bun run ts:check`. It's much faster but may have subtle differences.

## The baseline

`.claude/.tscheck-baseline` contains the current numeric baseline of pre-existing TypeScript errors on `main` (currently 80 on TypeScript 6.0.2 + tsgo 7.0.0-dev).

**This file is load-bearing, not just a shortcut.** A `PostToolUse` hook in `.claude/settings.json` reads this file after every `.ts`/`.tsx` `Edit` or `Write`, re-runs `bun run ts:check`, and **fails loudly if the count increased**.

## Rules

1. **Before investigating any TS error**, establish the baseline:
   ```bash
   git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop
   ```
   Only worry about **new** errors your changes introduce.

2. **If you legitimately reduce the baseline**, update the file:
   ```bash
   bun run ts:check 2>&1 | grep -c "error TS" > .claude/.tscheck-baseline
   ```

3. **If the file is missing**, the hook treats the current count as the baseline for that run only — do not delete it.

4. **If the hook blocks your edit**, it means you introduced a new TS error. Fix the new error before continuing, or investigate whether the baseline file is stale.

## Install requirement

`tsgo` is **not bundled** with this repo. Install it globally:
```bash
npm install -g @typescript/native-preview
```

Without it, `bun run ts:check` will fail with `command not found`.

## TS 6.0 — `types[]` is load-bearing

TypeScript 6.0 defaults `compilerOptions.types` to `[]` (was auto-discover all `@types/*`). When adding a new `@types/*` devDependency, you MUST also add it to `tsconfig.json > compilerOptions.types` or its ambient declarations won't resolve. Current list: `["node", "better-sqlite3", "diff", "react", "react-dom"]`.

## Why we use tsgo

- **10-50x faster** than `tsc` on large projects
- **Same diagnostics** as `tsc` for the subset of TS features we use
- **Known differences**: occasional false-positives on very-rare type edge cases; when encountered, file an issue at microsoft/typescript-native-preview

## Related canonical doc

- `docs/conventions/tscheck-baseline.md` — baseline mechanics and hook behavior
