---
title: Architecture Diagrams
icon: git-branch
---

# Architecture Diagrams

Visual representations of the codebase structure derived from the code knowledge graph.

## Three-Layer Electron Architecture

```mermaid
graph TB
    subgraph "Renderer Process (React 19 + Tailwind 4)"
        direction TB
        UI[UI Components]
        Hooks[React Hooks]
        Stores[Jotai + Zustand Stores]
        RemoteTRPC[remote-trpc.ts<br/>Upstream F-entry Boundary]
    end

    subgraph "Preload (IPC Bridge)"
        IPC[contextBridge API]
    end

    subgraph "Main Process (Node.js 24)"
        direction TB
        TRPC[23 tRPC Routers]
        AuthMgr[Auth Manager<br/>Strangler Fig Pattern]
        CredStore[Credential Store<br/>3-tier Encryption]
        EntAuth[Enterprise Auth<br/>MSAL Node + Entra ID]
        GraphProfile[Graph Profile<br/>User.Read Delegated]
        DB[(SQLite via Drizzle<br/>7 tables)]
        Git[Git Subsystem<br/>simple-git + cache]
        Terminal[Terminal<br/>node-pty]
        Plugins[Plugin System<br/>MCP Discovery]
        Claude[Claude Agent SDK]
        Codex[Codex CLI]
        Ollama[Ollama Client]
        AuxAI[Aux-AI Module<br/>DI Factory Pattern]
        LiteLLM[LiteLLM Router<br/>Proxy Client]
        FeatureFlags[Feature Flags<br/>9 flags]
    end

    UI --> Hooks
    Hooks --> Stores
    UI --> IPC
    Stores --> IPC
    IPC --> TRPC
    RemoteTRPC -.->|dead upstream| External[1code.dev API]

    TRPC --> AuthMgr
    TRPC --> CredStore
    TRPC --> DB
    TRPC --> Git
    TRPC --> Terminal
    TRPC --> Plugins
    TRPC --> LiteLLM

    AuthMgr --> EntAuth
    AuthMgr --> CredStore
    EntAuth --> GraphProfile

    TRPC --> Claude
    TRPC --> Codex
    TRPC --> Ollama
    TRPC --> AuxAI

    AuxAI --> Claude
    AuxAI --> Ollama
    AuxAI --> LiteLLM

    FeatureFlags --> AuthMgr
    FeatureFlags --> AuxAI
    FeatureFlags --> CredStore
```

## Community Clustering -- High-Level Domains

The Leiden algorithm detected 406 communities. Grouping by naming prefix reveals these high-level architectural domains:

```mermaid
graph LR
    subgraph "Main Process Communities"
        routers["routers-*<br/>(19 communities)"]
        lib["lib-*<br/>(28 communities)"]
        git["git-*<br/>(16 communities)"]
        main["main-*<br/>(10 communities)"]
        terminal_main["terminal-*<br/>(16 communities)"]
        security["security-*<br/>(3 communities)"]
        platform["platform-*<br/>(5 communities)"]
    end

    subgraph "Renderer Communities"
        ui["ui-*<br/>(50+ communities)"]
        components["components-*<br/>(30+ communities)"]
        hooks["hooks-*<br/>(20+ communities)"]
        settings["settings-*<br/>(15+ communities)"]
        themes["themes-*<br/>(5 communities)"]
    end

    subgraph "Test Communities"
        regression["regression-*<br/>(14 communities)"]
    end

    routers --> lib
    lib --> git
    lib --> security
    main --> lib
    ui --> hooks
    components --> hooks
    settings --> ui
    regression --> lib
    regression --> routers
```

## Largest Communities by Node Count

| Community | Size | Cohesion | Primary File |
|-----------|------|----------|-------------|
| ui-icon | 256 | 0.739 | Icon components (SVG exports) |
| ui-icon-2 | 220 | 0.987 | Canvas icon components |
| routers-codex | 59 | 0.324 | codex.ts tRPC router |
| icons-icon | 49 | 0.356 | Framework icons |
| icons-icon-2 | 45 | 0.786 | Icon index |
| git-branch | 33 | 0.196 | worktree.ts (31 functions) |
| lib-draft | 33 | 0.371 | drafts.ts (message drafts) |
| main-handle | 33 | 0.059 | Main window handlers |
| cache-invalidate | 30 | 0.782 | git-cache.ts (LRU + GitCache) |
| ui-handle | 29 | 0.183 | Agent diff view |

## Cohesion Analysis

### High-Cohesion Communities (well-encapsulated modules)

| Community | Cohesion | Interpretation |
|-----------|----------|---------------|
| cache-invalidate | 0.782 | LRUCache + GitCache -- tight internal coupling, clean API |
| main-auth | 0.407 | Auth manager -- reasonable encapsulation |
| lib-credential | 0.375 | Credential store -- 10 functions, well-bounded |
| lib-draft | 0.371 | Message draft management |
| routers-codex | 0.324 | Codex tRPC router -- large but self-contained |

### Low-Cohesion Communities (potential refactoring targets)

| Community | Cohesion | Interpretation |
|-----------|----------|---------------|
| routers-claude | 0.138 | Claude router -- many external dependencies |
| git-branch | 0.196 | Worktree module -- 31 functions, many cross-cutting concerns |
| lib-config | 0.273 | Claude config -- reads/writes across many systems |

## Auth Subsystem Flow

```mermaid
sequenceDiagram
    participant R as Renderer
    participant IPC as Preload IPC
    participant TRPC as enterpriseAuth Router
    participant AM as Auth Manager
    participant MSAL as MSAL Node
    participant CS as Credential Store
    participant GP as Graph Profile
    participant Entra as Microsoft Entra ID

    R->>IPC: signIn()
    IPC->>TRPC: enterpriseAuth.signIn
    TRPC->>AM: createEnterpriseAuth()
    AM->>CS: getCredentialTier()
    CS->>CS: detectTier()
    AM->>MSAL: acquireTokenInteractive()
    MSAL->>Entra: Authorization Code Flow
    Entra-->>MSAL: id_token + access_token
    MSAL-->>AM: AuthenticationResult
    AM->>CS: encryptCredential(token)
    AM->>GP: fetchGraphProfile(accessToken)
    GP->>Entra: GET /me + /me/photo/$value
    Entra-->>GP: Profile + Avatar
    GP-->>AM: GraphProfile
    AM-->>TRPC: { status, profile }
    TRPC-->>R: AuthStatus
```

## Git Subsystem Architecture

```mermaid
graph TB
    subgraph "Git Routers (tRPC)"
        StatusRouter[createStatusRouter<br/>status.ts]
        StagingRouter[createStagingRouter<br/>staging.ts]
        FileContents[createFileContentsRouter<br/>file-contents.ts]
    end

    subgraph "Git Core"
        Factory[git-factory.ts<br/>createGit / withGitLock]
        Worktree[worktree.ts<br/>31 functions]
        Cache[git-cache.ts<br/>LRU + GitCache]
    end

    subgraph "Git Utilities"
        ParseStatus[parse-status.ts<br/>parseGitStatus / parseGitLog]
        ApplyNumstat[apply-numstat.ts]
        GitUtils[git-utils.ts]
    end

    StatusRouter --> Factory
    StatusRouter --> ParseStatus
    StatusRouter --> Cache
    StagingRouter --> Factory
    FileContents --> Factory
    FileContents --> Cache
    Factory --> Worktree
    Factory --> GitUtils
    ParseStatus --> ApplyNumstat
```

## MCP Configuration Resolution

```mermaid
graph TD
    Handler[getAllMcpConfigHandler]
    Handler --> GlobalConfig[readClaudeConfig<br/>~/.claude/config.json]
    Handler --> DirConfig[readClaudeDirConfig<br/>.claude/config]
    Handler --> ProjectMcp[readProjectMcpJson<br/>.claude/mcp.json]
    Handler --> PluginDiscover[discoverPluginMcpServers<br/>Scan installed plugins]
    Handler --> PluginApproved[getApprovedPluginMcpServers<br/>Filter by settings]

    GlobalConfig --> MergedGlobal[getMergedGlobalMcpServers]
    DirConfig --> MergedLocal[getMergedLocalProjectMcpServers]
    ProjectMcp --> MergedLocal
    PluginDiscover --> PluginApproved
    MergedGlobal --> FinalConfig[Final MCP Config]
    MergedLocal --> FinalConfig
    PluginApproved --> FinalConfig

    subgraph "Per-Server Processing"
        FinalConfig --> ExpandEnv[expandMcpServerEnvVars]
        FinalConfig --> ResolveWorktree[resolveProjectPathFromWorktree]
    end
```

## File Distribution

| Layer | Files | % |
|-------|-------|---|
| src/renderer/ | ~300 | 50% |
| src/main/ | ~150 | 25% |
| tests/ | ~55 | 9% |
| services/1code-api/ | ~50 | 8% |
| scripts/ | ~15 | 3% |
| src/preload/ + src/shared/ | ~10 | 2% |
| Config/build | ~14 | 2% |
