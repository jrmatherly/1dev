## Design

### Approach

Upgrade TypeScript from 5.9.3 to 6.0.2 — the "bridge release" before TS 7.0 (Go rewrite). This is primarily a type-checking concern because the project uses `noEmit: true` with esbuild for actual transpilation.

### Architecture Impact

**No runtime changes.** TypeScript is a dev-time type checker only. The build pipeline (esbuild via electron-vite) strips types and is unaffected by TS version changes.

### tsconfig.json Migration

The current tsconfig is well-positioned because most options are already set explicitly. Required changes:

```jsonc
{
  "compilerOptions": {
    // ADD — TS 6.0 defaults types to [] (was auto-discover @types/*)
    "types": ["node"],
    
    // ADD — TS 6.0 enables this by default; CSS imports would error
    "noUncheckedSideEffectImports": false,
    
    // KEEP (already explicit, unaffected by new defaults)
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "rootDir": "./src"
  }
}
```

### Error Baseline Strategy

The current baseline (~86 errors in `.claude/.tscheck-baseline`) will shift. Strategy:

1. Upgrade TypeScript
2. Add `types` and `noUncheckedSideEffectImports` to tsconfig
3. Run `bun run ts:check` immediately
4. Record new error count as the new baseline
5. If count increases dramatically, use `"ignoreDeprecations": "6.0"` as temporary escape hatch

### tsgo Alignment

The `@typescript/native-preview` (tsgo) package must be updated to a version that aligns with TS 6.0 semantics, particularly the `types: []` default. Without this, `tsc` and `tsgo` may produce different results.

### Verification Strategy

1. Type checking: `bun run ts:check` against new baseline
2. Build: `bun run build` succeeds (esbuild is TS-version-agnostic)
3. Tests: `bun test` — all regression guards pass
4. No runtime testing needed (type-checking-only change)
