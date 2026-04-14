---
title: Key Subsystems
icon: layers
---

# Key Subsystems Deep-Dive

Detailed analysis of the most architecturally significant code communities.

## 1. Credential Store (`lib-credential`)

**File:** `src/main/lib/credential-store.ts` | **Size:** 10 nodes | **Cohesion:** 0.375

### Members

| Function | Lines | Purpose |
|----------|-------|---------|
| `CredentialStorageRefusedError` (Class) | 20-30 | Error type for encryption refusal |
| `detectTier` | 46-69 | Detect available encryption tier |
| `getCredentialTier` | 75-81 | Cached tier accessor |
| `getCredentialBackend` | 87-91 | Get storage backend name |
| `logCredentialTier` | 101-116 | Log tier at startup |
| `assertCanEncrypt` | 122-138 | Guard: encryption available? |
| `encryptCredential` | 147-151 | Encrypt a credential string |
| `decryptCredential` | 158-161 | Decrypt a credential string |

### Execution Flows Passing Through

| Flow | Criticality |
|------|-------------|
| `createEnterpriseAuth` | 0.811 |
| `storeOAuthToken` | 0.805 |
| `updateUser` | 0.799 |
| `isAuthenticated` | 0.695 |
| `getUser` | 0.695 |
| `getToken` | 0.695 |
| `logCredentialTier` | 0.620 |
| `getClaudeCodeToken` | 0.610 |

### Architectural Role

Central credential encryption gateway. **HARD RULE:** no direct `safeStorage.*` calls outside this module. Enforced by `tests/regression/credential-storage-tier.test.ts`. Three-tier detection: safeStorage > keytar > plaintext (with feature-flag gate).

## 2. Claude Configuration (`lib-config`)

**File:** `src/main/lib/claude-config.ts` | **Size:** 19 nodes | **Cohesion:** 0.273

### Members

| Function | Lines | Purpose |
|----------|-------|---------|
| `readClaudeConfig` | 61-68 | Read ~/.claude/config.json |
| `writeClaudeConfig` | 86-92 | Write config |
| `updateClaudeConfigAtomic` | 112-121 | Read-modify-write atomically |
| `getMcpServerConfig` | 151-164 | Get single MCP server config |
| `updateMcpServerConfig` | 171-198 | Update MCP server config |
| `removeMcpServerConfig` | 205-231 | Remove MCP server |
| `resolveProjectPathFromWorktree` | 241-310 | Resolve worktree to project path |
| `expandEnvVars` | 321-331 | Expand env vars in strings |
| `expandMcpServerEnvVars` | 336-372 | Expand env vars in MCP config |
| `readProjectMcpJson` | 380-418 | Read .claude/mcp.json |
| `getMergedGlobalMcpServers` | 480-494 | Merge global MCP servers |
| `getMergedLocalProjectMcpServers` | 501-521 | Merge local project MCP servers |

### Architectural Role

Central MCP/Claude configuration hub. Relatively low cohesion (0.273) because it serves many consumers across MCP auth, plugin discovery, and router configuration. This is a natural integration point rather than a refactoring smell.

## 3. Git Cache (`cache-invalidate`)

**File:** `src/main/lib/git/cache/git-cache.ts` | **Size:** 30 nodes | **Cohesion:** 0.782

Two classes with clear separation:

**LRUCache (generic, lines 21-185):**
- `constructor`, `get`, `getIfHashMatches`, `set`, `delete`
- `invalidateByPrefix`, `clear`, `getStats`
- `evictIfNeeded`, `evictLRU` (private)

**GitCache (domain-specific, lines 247-348):**
- `getStatus/setStatus/invalidateStatus`
- `getParsedDiff/setParsedDiff/invalidateParsedDiff`
- `getFileContent/getFileContentIfHashMatches/setFileContent`
- `invalidateFileContent/invalidateAllFileContents`
- `invalidateWorktree`, `getStats/clearAll`

### Architectural Role

Performance-critical caching layer for git operations. The high cohesion (0.782) indicates a well-encapsulated module with tight internal coupling and a clean external API. LRUCache is a generic data structure; GitCache composes three LRUCache instances (status, parsedDiff, fileContent) into a domain-specific facade.

## 4. Git Worktree (`git-branch`)

**File:** `src/main/lib/git/worktree.ts` | **Size:** 33 nodes | **Cohesion:** 0.196

### Members (31 exported functions)

| Category | Functions |
|----------|----------|
| **Worktree lifecycle** | `createWorktree`, `removeWorktree`, `worktreeExists`, `createWorktreeForChat` |
| **Branch operations** | `generateBranchName`, `listBranches`, `getCurrentBranch`, `checkoutBranch`, `safeCheckoutBranch`, `checkBranchCheckoutSafety` |
| **Remote operations** | `hasOriginRemote`, `branchExistsOnRemote`, `pushWorktreeBranch`, `fetchDefaultBranch`, `refreshDefaultBranch` |
| **Status checks** | `hasUncommittedChanges`, `hasUnpushedCommits`, `checkNeedsRebase`, `getGitStatus` |
| **Diff/commit** | `getWorktreeDiff`, `commitWorktreeChanges`, `mergeWorktreeToMain` |
| **Error handling** | `isExecFileException`, `isEnoent`, `categorizeGitError`, `sanitizeGitError`, `refExistsLocally` |

### Architectural Role

The largest single-file module in the git subsystem. Low cohesion (0.196) reflects its role as a "god module" -- logically 4-5 modules. **External dependency:** `simple-git` (23 outgoing edges -- the most of any module).

## 5. Auth Manager (`main-auth`)

**File:** `src/main/auth-manager.ts` | **Size:** 24 nodes | **Cohesion:** 0.407

Strangler Fig adapter pattern for migrating from upstream OAuth to enterprise Entra ID authentication. Gated by `enterpriseAuthEnabled` feature flag.

When `enterpriseAuthEnabled`:
- Sign-in delegates to MSAL Node (`acquireTokenInteractive()`)
- Token refresh via `acquireTokenSilent()`
- `applyEnterpriseAuth()` injects tokens into Claude spawn env

When disabled:
- Falls back to legacy OAuth flow (credential-store token retrieval)

## 6. Codex Router (`routers-codex`)

**File:** `src/main/lib/trpc/routers/codex.ts` | **Size:** 59 nodes | **Cohesion:** 0.324

The largest tRPC router. Handles the entire Codex CLI integration: process lifecycle (spawn, attach, terminate), message streaming, MCP server configuration, Codex-specific auth (API key management), and Codex binary version management.

## 7. Terminal Subsystem

Spread across ~16 communities (~118 nodes total):

| Community | Size | Primary Concern |
|-----------|------|----------------|
| terminal-session | 20 | Session management |
| terminal-setup | 15 | PTY setup |
| terminal-scan | 14 | Output scanning |
| terminal-history-history | 13 | Command history |
| terminal-env | 11 | Environment vars |
| terminal-handle | 9 | Event handlers |
| terminal-pty | 9 | node-pty interface |
| terminal-process | 7 | Process lifecycle |
| terminal-terminal | 7+5+3+2 | Terminal component |
| terminal-data | 6 | Data transfer |

The terminal is the most distributed subsystem -- 16 communities averaging 7.4 nodes each. This is appropriate decomposition: each concern (PTY, history, scanning, environment) is well-isolated.

## 8. Plugin System

| Community | Size | Primary Concern |
|-----------|------|----------------|
| plugins-plugin | 5 | Plugin discovery/loading |
| providers-servers | 6 | MCP server providers |
| providers-search | 5+5 | Search providers |
| providers-register | 3 | Provider registration |
| providers-truncated | 7 | Provider truncation |

Lightweight (26 total nodes) but sits at a critical junction -- it feeds into the MCP configuration resolution flow (criticality 0.747).

## 9. Regression Test Communities

| Community | Size | Primary Guard |
|-----------|------|--------------|
| regression-test-assertion | 16 | Multi-assertion tests |
| regression-ts | 13+10 | TypeScript checks |
| regression-feature | 8 | Feature flag guards |
| regression-auth | 7 | Auth guards |
| regression-api | 7 | API guards |
| regression-version | 7 | Version pin guards |
| regression-gpg | 5 | GPG verification |
| regression-collect | 5 | Collect guards |

Total: ~95 nodes in regression test communities (402 Test nodes total in the graph).
