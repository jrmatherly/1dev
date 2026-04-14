---
title: Code Graph Overview
icon: chart-network
---

# Code Graph Overview

Static analysis of the 1Code codebase using Tree-sitter parsing and Leiden community detection. This section documents the structural knowledge graph — 3,797 nodes and 29,438 edges across 594 files.

## What is the code graph?

The code-review-graph MCP server parses every TypeScript/TSX/JavaScript file with Tree-sitter, builds a structural graph of functions, classes, imports, and call relationships, then applies the **Leiden community detection algorithm** to find clusters of related code.

This produces:
- **Communities** — groups of related symbols that form natural module boundaries
- **Execution flows** — call chains from entry points through the codebase, ranked by criticality
- **Cross-community edges** — import dependencies between communities, revealing coupling patterns

## Graph Statistics

| Metric | Value |
|--------|-------|
| Total files | 594 |
| Total nodes | 3,797 |
| Total edges | 29,438 |
| Languages | TypeScript, JavaScript, TSX |
| Communities | 406 |
| Execution flows | 50+ |

### Nodes by Kind

| Kind | Count | % of Total |
|------|-------|-----------|
| Function | 2,765 | 72.8% |
| File | 594 | 15.6% |
| Test | 402 | 10.6% |
| Class | 36 | 0.9% |

### Edges by Kind

| Kind | Count | % of Total |
|------|-------|-----------|
| CALLS | 20,141 | 68.4% |
| CONTAINS | 3,249 | 11.0% |
| IMPORTS_FROM | 3,067 | 10.4% |
| TESTED_BY | 2,135 | 7.3% |
| REFERENCES | 846 | 2.9% |

## Key Observations

- **Function-dominant codebase:** 72.8% of all nodes are functions, reflecting a functional/procedural style typical of Node.js + React codebases. Only 36 classes exist (0.9%), mostly in infrastructure code (LRUCache, GitCache, CredentialStorageRefusedError, QueueProcessor).

- **High call density:** 20,141 CALLS edges means on average each function calls ~7.3 others — a moderately coupled codebase. The IMPORTS_FROM (3,067) to CALLS (20,141) ratio of ~6.6x indicates deep call chains within imported modules.

- **Good test coverage signal:** 402 Test nodes and 2,135 TESTED_BY edges suggest substantial test infrastructure. The 2,135 TESTED_BY edges across 402 tests means ~5.3 assertions per test on average.

- **36 classes** include: `LRUCache` (git cache layer), `GitCache` (composite cache), `CredentialStorageRefusedError` (credential-store error type), `QueueProcessor` (background task queue), and various UI component classes.

## Pages in this section

| Page | Description |
|------|-------------|
| [Architecture Diagrams](./architecture-diagrams) | Mermaid diagrams of the three-layer architecture, auth flow, git subsystem, MCP config resolution |
| [Critical Flows](./critical-flows) | Top 50 execution flows ranked by criticality with detailed call chains |
| [Community Coupling](./community-coupling) | Cross-community dependency analysis, coupling hotspots, and refactoring recommendations |
| [Key Subsystems](./key-subsystems) | Deep-dives on credential store, config hub, git cache, worktree, auth manager, and more |
| [Community Catalog](./community-catalog) | Full listing of all 406 detected code communities by domain |

## How to regenerate

The graph can be rebuilt and the wiki regenerated via the code-review-graph MCP tools:

```bash
# From Claude Code session:
# 1. Build/update the graph
#    Use: mcp__plugin_code-review-graph_code-review-graph__build_or_update_graph_tool

# 2. Generate wiki pages (407 pages at .code-review-graph/wiki/)
#    Use: mcp__plugin_code-review-graph_code-review-graph__generate_wiki_tool
```

Last generated: 2026-04-14
