---
name: new-regression-guard
description: Scaffold a new bun:test regression guard under tests/regression/ following the existing file-walking + forbidden-patterns + structured-error-report pattern. Ask the user for the guard name, scan scope, forbidden patterns or assertion type, allowlist files, and the motivating OpenSpec change or Phase 0 gate. User-only — explicit invocation, not a background task.
disable-model-invocation: true
---

## Scaffold a New bun:test Regression Guard

The repo has multiple regression guards under `tests/regression/`. The canonical list and purpose of each guard lives in `docs/conventions/regression-guards.md`. They all share a common file-walking + forbidden-patterns + structured-error-report pattern. This skill scaffolds a new one without copy-pasting the ~80 lines of boilerplate.

**To see the current count and list:**
```bash
ls tests/regression/*.test.ts | wc -l
ls tests/regression/*.test.ts
```

## When to run this skill

- Phase 0 hard gates that land a "must not regress" invariant (dead code deletion, token log removal, feature flag schema, etc.)
- OpenSpec changes that introduce a capability spec with a regression-sensitive rule (e.g., `brand-identity` Tier A enforcement)
- Any time the user says "I want a test that fails if X ever comes back"

## When NOT to run this skill

- Functional tests belong in `tests/` but NOT under `tests/regression/` — this skill is only for guards
- If the invariant can be enforced at the type level (e.g., make a field non-nullable), prefer that over a runtime guard
- If the grep pattern is ambiguous (would false-positive on legitimate code), redesign the invariant first

## Existing guards to read as patterns

Read ONE of these as a template based on the style of invariant. The canonical list and purpose of each guard is maintained in `docs/conventions/regression-guards.md` — refer to it for the full inventory.

| Existing guard | Pattern type | Read when your guard is... |
|---|---|---|
| `tests/regression/auth-get-token-deleted.test.ts` | File-existence assertion | A deleted-file guard ("X.ts must not exist") |
| `tests/regression/token-leak-logs-removed.test.ts` | Forbidden-substring in a directory | A pattern-in-directory guard ("string S must not appear in dir D") |
| `tests/regression/brand-sweep-complete.test.ts` | Forbidden-pattern + file-level allowlist | A pattern guard with Tier C exceptions |
| `tests/regression/gpg-verification-present.test.ts` | Required-substring (inverse) | A pattern-REQUIRED guard ("string S MUST appear in file F") |
| `tests/regression/feature-flags-shape.test.ts` | Schema-shape assertion | A structural guard ("object O must have field F") |
| `tests/regression/credential-manager-deleted.test.ts` | File-existence assertion (mirror of auth-get-token) | A deleted-file guard with related reasoning |

## Questions to ask the user

If not provided as arguments, ask:

1. **Guard name** (kebab-case, e.g., `sandbox-oauth-removed`). Avoid generic names like `new-guard`; prefer `{what}-{state}` (`something-removed`, `something-present`, `something-shape`).
2. **Pattern type** — file-existence / forbidden-substring / required-substring / structural.
3. **Scan scope** — one of `src/main/`, `src/renderer/`, `scripts/`, or a custom list of directories + individual files.
4. **Forbidden patterns** (for forbidden-substring type) or the required patterns (for required-substring type) — case-sensitive by default, flag case-insensitive explicitly.
5. **Allowlist** — file-level whole-file exemptions, each with a one-line justification linking to a Tier C attribution or deliberate preservation rationale.
6. **Motivating source** — the OpenSpec change name OR the Phase 0 gate number that introduced the invariant. Every guard's docstring MUST cite its source.

## Steps

1. **Read the closest-match template** from the table above. Do NOT blindly copy `brand-sweep-complete.test.ts` unless the new guard also needs file-level allowlisting.

2. **Create the guard file** at `tests/regression/{guard-name}.test.ts`. Match the existing structure:
   - Top-of-file docstring: what invariant this guard enforces, why it exists, what change or gate motivated it, and a link to the relevant OpenSpec change or `docs/` page
   - Imports: `describe`, `test`, `expect` from `bun:test`; file I/O helpers from `node:fs` + `node:path`
   - `REPO_ROOT` constant computed via `join(import.meta.dir, "..", "..")`
   - Walker generator (`walkFiles`, `walkTsFiles`, or similar) if scanning a directory
   - Pattern array or assertion block
   - One `describe` block with a descriptive name matching the guard's purpose
   - One or more `test` blocks with structured error reporting (file:line, matched substring, explanation)

3. **Run the new guard in isolation** to confirm it passes:
   ```bash
   bun test tests/regression/{guard-name}.test.ts
   ```

4. **Run the full test suite** to confirm the new guard doesn't break any existing one:
   ```bash
   bun test
   ```

5. **Update documentation surfaces** — add the new guard to:
   - `docs/conventions/regression-guards.md` (canonical list) — add the guard name, purpose, and a link to its motivating OpenSpec change or Phase 0 gate
   - `CLAUDE.md` — if the critical-rules or pointers section cites a count or list, increment it
   - `.claude/PROJECT_INDEX.md` — if it lists guards, update the count
   - `.serena/memories/task_completion_checklist.md` — if it mentions the guard count, update it
   The `docs-drift-check` skill will flag any missed surface.

6. **Verify the guard FAILS in a controlled way** — temporarily reintroduce the forbidden pattern in a test file, run the guard, confirm the failure message is clear and actionable, then revert. The error message is what future contributors will see when their commit gets blocked — it must name the file, the line, the pattern, and provide a path forward (e.g., "add to ALLOWLIST_FILES with a justifying comment").

## Error-message conventions

Every guard's failure message should contain:

1. **Count**: "Found N regression(s)"
2. **Structured list**: one line per offender with `file:line`, matched content snippet (truncated), and the pattern name
3. **Actionable next step**: how to fix (remove the pattern, add to allowlist with justification, update the baseline file, etc.)
4. **Reference**: link to the OpenSpec change or Phase 0 gate so the contributor can read the rationale

Example from `brand-sweep-complete.test.ts`:

```typescript
throw new Error(
  `Found ${offenders.length} Tier A brand regression(s) outside the allowlist:\n${report}\n\n` +
    `If the occurrence is a legitimate Tier C attribution, add the FILE to ALLOWLIST_FILES ` +
    `in tests/regression/brand-sweep-complete.test.ts with a comment justifying the addition. ` +
    `Otherwise, remove or rebrand the identifier.`,
);
```

## Allowlist conventions

- **File-level, not line-level** — whole-file exemptions survive edits within the allowlisted file. Line-number allowlists break the moment someone adds a blank line above the exempted region.
- **Use a `Set<string>` of repo-relative paths**
- **Every entry must have a comment** — explain why the file is exempt and what Tier (A/B/C) or category it represents
- **Minimize the allowlist** — every entry is a policy decision. If you find yourself adding more than 2-3 exemptions, the pattern is probably too broad; redesign the invariant instead

## Don't forget

- The guard must be **side-effect free** — it only reads files, never writes
- The guard must complete in **<200ms** on a warm filesystem (the full regression suite currently runs in ~2.5s for 48 tests across 12 files)
- The guard must NOT depend on `bun` being installed at a specific path — use only `bun:test` imports and `node:fs`/`node:path`
- The guard must NOT require network access — all checks are local
- Update the OpenSpec change's tasks.md to reference the new guard in the §14 "Regression guard" section if this guard is part of an active change
