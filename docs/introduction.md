---
title: Introduction
icon: rocket
---

# 1Code Documentation {subtitle="Enterprise fork — canonical documentation"}

**1Code** is a local-first Electron desktop app for parallel AI-assisted development. Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution.

This repository is the **enterprise fork**, being decoupled from the upstream `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway). See [Fork Posture](enterprise/fork-posture.md) for the full context.

## Quick Navigation

| Section | What you'll find |
|---------|-----------------|
| [Architecture](architecture/overview.md) | Codebase structure, tech stack, database schema, tRPC routers, upstream boundary |
| [Enterprise](enterprise/fork-posture.md) | Migration narrative, auth strategy, [Phase 0 gates](enterprise/phase-0-gates.md), cluster facts |
| [Conventions](conventions/quality-gates.md) | Quality gates, regression guards, brand taxonomy, pinned deps |
| [Operations](operations/release.md) | Release pipeline, debugging, cluster access, env gotchas |
| [API Reference](api-reference) | OpenAPI scaffold — placeholder content from the xyd starter template, awaiting real API surface |

## For Contributors

Before making changes, read:

1. **[Quality Gates](conventions/quality-gates.md)** — the five gates every PR must pass
2. **[No .scratchpad/ References](conventions/no-scratchpad-references.md)** — tracked files must only reference tracked files
3. **[Regression Guards](conventions/regression-guards.md)** — the guards that protect invariants
4. **[`.claude/rules/`](https://github.com/jrmatherly/1dev/tree/main/.claude/rules)** — Claude Code behavioral rules (auto-loaded when working on matching files) that complement the canonical docs here

## Building These Docs Locally

```bash
cd docs
bun install --frozen-lockfile
bunx xyd          # dev server at http://localhost:5175
bun run build     # static output to .xyd/build/client/
```
