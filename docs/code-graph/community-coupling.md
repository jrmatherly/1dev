---
title: Community Coupling
icon: link
---

# Cross-Community Coupling Analysis

Analysis of dependency edges between code communities, identifying architectural boundaries and coupling hotspots.

**Totals:** 406 communities, 331 raw cross-community IMPORTS_FROM edges, 132 distinct source-target community pairs.

## Architecture Warnings

These are the graph-detected high-coupling warnings:

1. **High coupling (19 edges)** between `git-git` and `security-git`
2. **High coupling (17 edges)** between `security-path` and `security-worktree`
3. **High coupling (16 edges)** between `security-git` and `security-path`
4. **High coupling (12 edges)** between `components-chat` and `lib-cn`

The top 3 warnings are all in the git/security subsystem -- architecturally expected since the security layer wraps git operations. Warning #4 reflects heavy `cn()` Tailwind utility usage in agent-chat-card.tsx.

## Top Cross-Community Edges

| Edges | Source Community | Target Community | Interpretation |
|-------|-----------------|-----------------|----------------|
| 19 | security-git | git-git | Security wraps git-factory.ts |
| 17 | security-worktree | security-path | Worktree security needs path validation |
| 16 | security-git | security-path | Git commands need path assertion |
| 12 | components-chat | lib-cn | Heavy cn() usage in chat UI |
| 7 | settings-tabs-item | lib-cn | Settings tabs styling |
| 6 | mcp-mcp | lib-cn | MCP dialog styling |
| 6 | ui-dialog | lib-cn | Dialog styling |
| 5 | git-status | utils-apply | Status to numstat parsing |
| 5 | git-status | utils-parse | Status to parse integration |
| 5 | hooks-handle | utils-shortcut | Hook to platform shortcuts |
| 4 | terminal-setup | terminal-terminal | Setup to config integration |
| 4 | lib-window | contexts-window | Window context bridge |
| 3 | git-branch | git-shell | Worktree to shell env |
| 3 | git-branch | git-worktree | Worktree to worktree config |
| 3 | github-map | git-shell | GitHub to shell env |
| 3 | terminal-pty | terminal-env | PTY to environment |

### The `lib-cn` Hub

`lib-cn` (src/renderer/lib/utils.ts, size 2, cohesion 0.0025) is the most depended-upon community -- it appears as a target in the majority of UI cross-community edges. This is the classic Tailwind `cn()` utility pattern. Not a concern -- it's a deliberate utility leaf.

## Credential Store as a Hub

The `lib-credential` community (credential-store.ts, 10 nodes) is the most critical hub in the auth subsystem:

**Incoming edges (called by):**
- `claude.ts::getClaudeCodeToken` (2 edges)
- `enterprise-store.ts` (1 edge)
- `claude-code.ts` (1 edge)
- `auth-manager.ts` (via createEnterpriseAuth flow)

**Outgoing edges (calls):**
- `electron.safeStorage` (1 edge)
- `feature-flags.ts::getFlag` (1 edge)

This is by design -- the credential store is the single entry point for all credential encryption, enforced by regression guard.

## Claude Config as an Integration Point

The `lib-config` community (claude-config.ts, 19 nodes) has the most diverse set of incoming callers:

- `mcp-auth.ts` -- 4 functions call into config
- `claude/mcp-resolver.ts` -- 2 functions
- `plugins/index.ts` -- 1 edge
- `trpc/routers/codex.ts` -- 1 edge
- `trpc/routers/claude.ts` -- 1 edge

Low cohesion (0.273) is expected for integration points.

## Terminal Subsystem Distribution

The terminal is split across 16 communities, with coupling primarily flowing through `terminal-session` (20 nodes) as the orchestrator:

```
terminal-session (manager.ts)
  |-- terminal-pty (session.ts) -- PTY spawning
  |-- terminal-env (env.ts) -- environment vars
  |-- terminal-data (data-batcher.ts) -- output batching
  |-- terminal-scan (port-manager.ts) -- port allocation
  +-- terminal-history (index.ts) -- history management
```

## Router-to-Library Coupling Patterns

| Router Community | Primary Lib Dependencies |
|-----------------|-------------------------|
| routers-codex (59) | lib-codex, lib-mcp, platform-* |
| routers-claude (19) | lib-credential, lib-config, claude-* |
| routers-approved (8) | lib-config, plugins-plugin |
| routers-command (6) | platform-shell |
| routers-validate (6) | security-path |
| routers-open (10) | lib-stream (voice recording) |

## Coupling Risk Matrix

| Source Community | Target Community | Risk Level | Reason |
|-----------------|-----------------|-----------|--------|
| routers-codex | lib-config | Low | Clean adapter pattern |
| main-handle | many | Medium | 33-node orchestration, 0.059 cohesion |
| lib-config | many consumers | Low | Natural integration point |
| lib-credential | electron | High | Platform dependency (safeStorage) |
| git-branch | simple-git | High | 23 edges to external lib |

## Refactoring Recommendations

1. **git-branch (worktree.ts)** -- 33 nodes, 0.196 cohesion. Consider splitting into: worktree-lifecycle.ts, branch-ops.ts, remote-ops.ts, git-errors.ts. Currently has 23 outgoing edges to `simple-git` alone.

2. **main-handle (active-chat.tsx)** -- 33 nodes, 0.059 cohesion. The main chat component orchestrates too many concerns. Consider extracting hooks for git-watching, PR generation, and tool-state management.

3. **hooks-use fragmentation** -- 18 separate communities all named "hooks-use". Review for consolidation opportunities -- some may be single-use hooks that could be inlined into their consumers.

4. **routers-codex (59 nodes)** -- The largest router by far. Consider splitting process management from message handling from MCP configuration.
