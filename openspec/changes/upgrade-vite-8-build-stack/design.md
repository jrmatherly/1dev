## Design

### Approach

Two-phase upgrade to manage risk:
- **Phase A** (unblocked): Vite 6→7 + plugin-react 4→5 using electron-vite 5.0.0 (stable)
- **Phase B** (blocked): Vite 7→8 + electron-vite 5→6 + plugin-react 5→6

### Architecture Impact

**Build infrastructure only.** No application code changes. The Electron three-layer architecture is unchanged. The main risk is the **bundler swap** (Rollup→Rolldown) in Phase B affecting CJS output for main/preload processes.

### Phase A: Vite 7 (Safe Stepping Stone)

Vite 7 with electron-vite 5.0.0 is a validated combination. Breaking changes are minimal:

1. Browser target default change — non-issue for Electron (targets Chromium)
2. CJS interop change — `resolve.mainFields` ordering for modules with both `browser` and `module` fields. Must verify `superjson`, `trpc-electron`, `gray-matter`, `async-mutex` (all in `externalizeDeps.exclude`)
3. `splitVendorChunkPlugin` removed — already not in our config

Plugin-react v5 changes:
- `resolve.dedupe` no longer auto-configured — may need manual React/react-dom dedup
- Default `exclude` now includes `node_modules`

### Phase B: Vite 8 (Architectural Shift)

**The Rolldown migration.** Vite 8 replaces both esbuild (for deps/transforms) and Rollup (for production builds) with Rolldown + Oxc.

#### electron-vite Compatibility

| electron-vite | Vite support | Status |
|---|---|---|
| 5.0.0 | ^5 \|\| ^6 \|\| ^7 | Stable |
| 6.0.0-beta.0 | ^6 \|\| ^7 \|\| ^8 | Beta only |

**Decision:** Wait for electron-vite 6.0.0 stable before executing Phase B. Monitor npm: `npm info electron-vite versions`.

#### CJS Output Validation

The main and preload processes use `output.format: "cjs"`. Under Rolldown, this needs careful validation:

```typescript
// Current (Rollup)
rollupOptions: {
  external: ["electron", "better-sqlite3", ...],
  output: { format: "cjs" }
}

// Target (Rolldown)
rolldownOptions: {
  external: ["electron", "better-sqlite3", ...],
  output: { format: "cjs" }
}
```

A compatibility layer auto-converts `rollupOptions` to `rolldownOptions`, so existing config works initially. Rename proactively to avoid deprecation warnings.

#### Oxc JSX Transform

Plugin-react v6 uses Oxc instead of Babel for JSX transforms. The `jsxImportSource` option (used for WDYR in dev mode) is preserved, but the underlying transform engine is different. Must verify WDYR integration at runtime.

### Electron-Specific Constraints

- electron-vite wraps Vite's config in its own `defineConfig` with `main`/`preload`/`renderer` sections
- `externalizeDeps` is an electron-vite-specific option (not standard Vite) — verify it works in electron-vite 6.x
- CJS output format is required for Electron's main and preload processes
- The renderer process uses ESM (standard Vite behavior)

### Verification Strategy

**Phase A:**
1. `bun run build` — CJS output for main/preload, ESM for renderer
2. `bun run dev` — hot reload, dev server
3. Functional test — tRPC, terminal, AI backends

**Phase B:**
1. Rolldown output comparison — bundle sizes, format correctness
2. CJS require chains — `better-sqlite3`, `node-pty`, `@anthropic-ai/claude-agent-sdk`
3. WDYR integration — dev mode console output
4. Full quality gates — 5 CI + 1 local-only lint advisory
5. Run `.claude/rules/vite-config.md` static-verification playbook against `out/` (CJS bundling, ESM-only dynamic imports preserved, `import.meta.env` fully replaced, single React instance)

### Rollback Plan (Phase B)

If Rolldown produces broken CJS output, the `.claude/rules/vite-config.md` static-check gate fails, or any of the 5 CI quality gates regresses **and cannot be resolved in-session**, revert to the known-good Phase A state:

```bash
# Revert pins
bun install vite@7.3.2 electron-vite@5.0.0 @vitejs/plugin-react@5.2.0

# Revert config (git restore if rolldownOptions rename landed)
git restore electron.vite.config.ts

# Clean rebuild to eliminate any Rolldown-cached artifacts
rm -rf out/ node_modules/.cache
bun run build
```

Phase A state is empirically validated (see tasks.md §1-4, all ✅) and is the stable fallback. Document the failure mode in `docs/operations/roadmap.md` with reproduction steps so the next Phase B attempt can target the specific regression.
