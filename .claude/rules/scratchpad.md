# No `.scratchpad/` references from tracked files

`.scratchpad/` is a gitignored directory for ephemeral local-only working notes. **Never cite specific `.scratchpad/` files from tracked files** — canonical docs live under `docs/`.

## Rule

- **DO NOT** reference specific `.scratchpad/` files from any tracked file under `src/`, `tests/`, `openspec/`, `.claude/`, `.serena/memories/`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, or `docs/`.
- **DO** link to the corresponding canonical page under `docs/` instead.
- **DO** delete references to `.scratchpad/` files that were once tracked — don't relink them.

## Enforcement

Enforced by `tests/regression/no-scratchpad-references.test.ts`. The guard has a narrow allowlist (see `docs/conventions/no-scratchpad-references.md`).

## Background

- Canonical rule spec: `openspec/specs/documentation-site/spec.md`
- Canonical convention doc: `docs/conventions/no-scratchpad-references.md`
- `.scratchpad/` is declared in `.gitignore` and used for temporary working notes only
