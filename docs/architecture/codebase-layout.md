---
title: Codebase Layout
icon: folder-tree
---

# Codebase Layout

> **Stub.** Full `src/` directory tree deferred to a follow-on change.

## Services Layer

The `services/` directory contains self-hosted backend services that replace the upstream `1code.dev` SaaS:

| Service | Stack | Purpose |
|---------|-------|---------|
| `services/1code-api/` | Fastify + tRPC + Drizzle/PostgreSQL | Backend API — changelog, plan, profile, health endpoints |

Container images are built via `.github/workflows/container-build.yml` and pushed to `ghcr.io/jrmatherly/1code-api`.

## TODO

- Full `src/` directory tree with annotations
- Feature module pattern (`src/renderer/features/*`)
- Preload bridge and context isolation
- File naming conventions (PascalCase components, camelCase utils, kebab-case stores)

See `.claude/PROJECT_INDEX.md` for the current detailed source.
