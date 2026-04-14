---
title: Critical Flows
icon: route
---

# Critical Execution Flows

Execution flows ranked by criticality score (0.0 - 1.0). Higher scores indicate flows that touch more critical infrastructure, cross more file boundaries, and have deeper call chains.

## Top 50 Flows

| Rank | Flow | Criticality | Nodes | Category |
|------|------|-------------|-------|----------|
| 1 | `createEnterpriseAuth` | 0.811 | 11 | Auth |
| 2 | `storeOAuthToken` | 0.805 | 12 | Auth |
| 3 | `updateUser` | 0.799 | 13 | Auth |
| 4 | `constructor` | 0.782 | 15 | Core |
| 5 | `handleDeepLink` | 0.762 | 24 | Navigation |
| 6 | `setUpdateAvailable` | 0.754 | 82 | Auto-update |
| 7 | `unlockDevTools` | 0.754 | 82 | DevTools |
| 8 | `createMainWindow` | 0.747 | 73 | Window |
| 9 | `getAllMcpConfigHandler` | 0.747 | 43 | MCP |
| 10 | `startMcpOAuth` | 0.744 | 17 | MCP Auth |
| 11 | `CodexLoginModal` | 0.742 | 9 | Codex Auth |
| 12 | `buildClaudeEnv` | 0.739 | 13 | Claude Env |
| 13 | `getAllCodexMcpConfigHandler` | 0.739 | 26 | Codex MCP |
| 14 | `Terminal` | 0.707 | 29 | Terminal |
| 15 | `AgentsLayout` | 0.701 | 8 | UI Layout |
| 16 | `fetchMcpOAuthMetadata` | 0.700 | 10 | MCP Auth |
| 17 | `ChatView` | 0.697 | 35 | UI Chat |
| 18 | `isAuthenticated` | 0.695 | 3 | Auth |
| 19 | `getUser` | 0.695 | 3 | Auth |
| 20 | `getToken` | 0.695 | 3 | Auth |
| 21 | `getRefreshToken` | 0.695 | 3 | Auth |
| 22 | `needsRefresh` | 0.695 | 3 | Auth |
| 23 | `AgentsSidebar` | 0.690 | 24 | UI Navigation |
| 24 | `runClaudeSetupToken` | 0.690 | 10 | Claude Setup |
| 25 | `CodeBlock` | 0.690 | 15 | UI Render |
| 26 | `CodexOnboardingPage` | 0.687 | 9 | Codex Onboard |
| 27 | `HighlightedJson` | 0.680 | 13 | UI Render |
| 28 | `CodeViewer` | 0.680 | 11 | UI Render |
| 29 | `KanbanView` | 0.680 | 10 | UI Kanban |
| 30 | `AgentsSubChatsSidebar` | 0.680 | 11 | UI Navigation |
| 31 | `NewChatForm` | 0.670 | 25 | UI Chat |
| 32 | `createOrAttach` | 0.663 | 20 | Terminal |
| 33 | `AgentsContent` | 0.644 | 13 | UI Content |
| 34 | `gitCheckoutFile` | 0.636 | 12 | Git |
| 35 | `gitCheckoutFiles` | 0.636 | 12 | Git |
| 36 | `gitStageFile` | 0.636 | 12 | Git |
| 37 | `gitStageFiles` | 0.636 | 12 | Git |
| 38 | `gitUnstageFile` | 0.636 | 12 | Git |
| 39 | `gitUnstageFiles` | 0.636 | 12 | Git |
| 40 | `QueueProcessor` | 0.635 | 11 | Queue |
| 41 | `exchangeCode` | 0.630 | 7 | OAuth |
| 42 | `fetchUserPlan` | 0.630 | 9 | User |
| 43 | `createWorktreeForChat` | 0.629 | 18 | Git Worktree |
| 44 | `startAuthFlow` | 0.620 | 3 | Auth |
| 45 | `logCredentialTier` | 0.620 | 4 | Credentials |
| 46 | `authenticate` | 0.620 | 9 | Auth |
| 47 | `handleUseExistingToken` | 0.620 | 3 | Auth |
| 48 | `gitSwitchBranch` | 0.615 | 10 | Git |
| 49 | `gitStageAll` | 0.615 | 10 | Git |
| 50 | `gitUnstageAll` | 0.615 | 10 | Git |

## Category Distribution

| Category | Count | Avg Criticality |
|----------|-------|----------------|
| Auth / Credentials | 14 | 0.72 |
| Git Operations | 10 | 0.63 |
| UI Components | 10 | 0.68 |
| MCP / Plugin | 4 | 0.73 |
| Window / Navigation | 3 | 0.75 |
| Terminal | 2 | 0.69 |
| Other | 7 | 0.66 |

## Highest-Risk Flow Details

### 1. createEnterpriseAuth (0.811)

**Entry:** Enterprise auth factory | **Depth:** 7 | **Files:** 5 | **Nodes:** 11

```
createEnterpriseAuth
  -> getCredentialTier (credential-store.ts:75)
     -> detectTier (credential-store.ts:46)
        -> safeStorage.isEncryptionAvailable()
        -> getSelectedStorageBackend()
        -> getFlag('credentialStorageRequireEncryption')
```

**Why critical:** Initializes the entire enterprise authentication subsystem. Touches credential storage, feature flags, and Electron's safeStorage API. A failure here blocks all enterprise auth operations.

### 2. storeOAuthToken (0.805)

**Entry:** OAuth token persistence | **Depth:** 3 | **Files:** 6 | **Nodes:** 12

```
storeOAuthToken
  -> encryptCredential (credential-store.ts:147)
     -> assertCanEncrypt (credential-store.ts:122)
        -> getCredentialTier -> detectTier
  -> createId (db/utils.ts:7)
  -> getCredentialTier (credential-store.ts:75)
```

**Why critical:** Persists OAuth tokens with encryption. Touches both the credential store and the database. Failure means tokens aren't saved, breaking re-authentication.

### 3. handleDeepLink (0.762)

**Entry:** Deep link URL handler | **Depth:** 6 | **Files:** 8 | **Nodes:** 24

```
handleDeepLink
  -> readClaudeConfig (claude-config.ts:61)
  -> getMcpServerConfig (claude-config.ts:151)
  -> bringToFront (window.ts:3)
  -> resolveProjectPathFromWorktree (claude-config.ts:241)
  -> updateClaudeConfigAtomic (claude-config.ts:112)
  -> updateMcpServerConfig (claude-config.ts:171)
  -> writeClaudeConfig (claude-config.ts:86)
```

**Why critical:** Handles `1code://` deep links for MCP server installation. Reads and writes Claude configuration, resolves worktree paths, and manages window focus. Wide blast radius across config and window management.

### 4. createMainWindow (0.747)

**Entry:** Main Electron window creation | **Depth:** 7 | **Files:** 19 | **Nodes:** 73

Touches 19 files -- the widest file spread of any flow. Initializes:
- Git routers (status, staging, file-contents)
- Git factory (lock management, network ops)
- CLI management (install, uninstall)
- File parsing (language detection, binary detection)
- Parse utilities (git status, log, numstat, name-status)

**Why critical:** This is the application bootstrap flow. Every subsystem that needs initialization at window creation time is reachable from here.

### 5. getAllMcpConfigHandler (0.747)

**Entry:** MCP configuration resolution | **Depth:** 5 | **Files:** 10 | **Nodes:** 43

Resolves MCP server configuration by merging:
1. Global Claude config (`readClaudeConfig`)
2. Claude dir config (`readClaudeDirConfig`)
3. Project MCP JSON (`readProjectMcpJson`)
4. Plugin-discovered MCP servers (`discoverPluginMcpServers`)
5. Approved plugin servers (`getApprovedPluginMcpServers`)

**Why critical:** Central hub for all MCP server discovery. Plugins, project config, and global config all converge here. A bug means MCP servers don't appear or get wrong credentials.

### 6. ChatView (0.697)

**Entry:** Main chat UI component | **Depth:** 4 | **Files:** 20 | **Nodes:** 35

The primary user interaction surface. Integrates: auto-import, terminal scope resolution, file/git watchers, PR message generation, push actions, agent tool utilities, auto-rename, and sub-chat cleanup.

### 7. Terminal (0.707)

**Entry:** Integrated terminal component | **Depth:** 4 | **Files:** 9 | **Nodes:** 29

Full terminal lifecycle: CWD parsing, instance creation, input handling (keyboard, paste, click-to-cursor, context menu, focus), resize management, theme integration (VSCode theme mapping), query response suppression, and shell path escaping.
