## ADDED Requirements

### Requirement: Three-tier brand taxonomy

The system SHALL classify every brand-bearing identifier, string, URL, filesystem path, and comment in the repository into exactly one of three tiers: **Tier A (upstream brand — MUST remove)**, **Tier B (product name — MUST keep)**, or **Tier C (attribution — MUST preserve)**. Every commit that introduces or modifies such an identifier SHALL classify it explicitly against the taxonomy before landing.

- **Tier A identifiers** are owned by the upstream company or its hosted services: `21st.dev`, `1code.dev`, `cdn.21st.dev`, `auth.21st.dev`, `sandbox-*.21st.sh`, `github.com/21st-dev/*`, the `@21st-dev/*` npm scope, the `twentyfirst-agents://` protocol scheme, app IDs beginning with `dev.21st.`, `21st-desktop` as a user-agent or OAuth client name, and `21st-notarize` as a keychain profile.
- **Tier B identifiers** are the product name and package identity of this enterprise fork and SHALL be retained: `"1Code"` as the product display name, `1code-desktop` as the npm package name, `resources/cli/1code` as the CLI launcher script, `.1code/worktree.json` as the per-worktree config filename, and the hidden `.1code/` home directory used for worktrees and repository clones.
- **Tier C identifiers** are historical or legal attribution strings required by Apache License 2.0 §4(c)–(d) and SHALL be preserved verbatim: the upstream PR link comment at `src/main/lib/cli.ts:6`, the "forked from 1Code by 21st-dev" attribution line at `README.md:3`, the copyright header in `LICENSE`, the top-level `NOTICE` file, and historical references inside documentation under `.scratchpad/`, `.full-review/`, `.serena/memories/`, `.claude/`, and `openspec/changes/`.

#### Scenario: Contributor classifies a new identifier correctly

- **WHEN** a contributor adds or modifies a string, URL, identifier, filesystem path, or comment in `src/`, `scripts/`, `package.json`, `README.md`, `LICENSE`, or `NOTICE`
- **THEN** the contributor SHALL classify the change as Tier A, Tier B, or Tier C before merging
- **AND** Tier A identifiers SHALL NOT appear in the change
- **AND** Tier B identifiers MAY appear without restriction
- **AND** Tier C identifiers SHALL match the exact surfaces enumerated in the requirement above

### Requirement: No Tier A identifiers in runtime code, scripts, or package metadata

The system SHALL NOT contain any Tier A (upstream brand) identifier in any file under `src/main/`, `src/renderer/`, `scripts/`, or in `package.json`, with the sole exception of `src/main/lib/cli.ts:6` (a comment-only upstream PR attribution preserved per Apache License 2.0 §4(c)).

The following search patterns MUST return zero matches in scope (case-insensitive): `21st`, `twentyfirst`, `1code.dev`, `cdn.21st`, `dev.21st`, `github.com/21st-dev`, `@21st-dev`, `21st-desktop`, `21st-notarize`.

Scope exclusions (Tier C allowlist) for the regression guard:
- `src/main/lib/cli.ts` — upstream PR attribution comment at line 6
- `README.md` — attribution sentence at line 3, including its `github.com/21st-dev/1Code` link target (which points at the upstream GitHub repository, not the hosted domain)

#### Scenario: Regression guard rejects reintroduction of a Tier A identifier

- **WHEN** a contributor commits a change that introduces a Tier A pattern into `src/`, `scripts/`, or `package.json` outside the Tier C allowlist
- **THEN** the `bun test` quality gate SHALL fail with a brand-sweep regression-guard error
- **AND** the error message SHALL name the offending file and line
- **AND** the commit SHALL be blocked from merging until the Tier A identifier is removed or reclassified

#### Scenario: Tier C allowlist permits historical attribution

- **WHEN** the regression guard scans `src/main/lib/cli.ts:6` and encounters the upstream PR link comment
- **THEN** the regression guard SHALL treat the occurrence as an allowed Tier C reference
- **AND** the scan SHALL not fail

#### Scenario: Runtime API routing defaults to the self-hosted domain

- **WHEN** a renderer-side fetch call constructs a URL via `getApiBaseUrl()` or `window.desktopApi.getApiBaseUrl()` without an explicit override
- **THEN** the resolved base URL SHALL be `https://apollosai.dev`
- **AND** the resolved base URL SHALL NOT contain `21st.dev`, `1code.dev`, or any other Tier A domain

### Requirement: Accessibility labels reflect current brand

The system SHALL NOT expose Tier A brand identifiers through assistive technology metadata. Specifically, SVG `aria-label`, `aria-labelledby`, `title`, and `<desc>` attributes in logo components, header artwork, or any user-visible graphic element SHALL NOT contain the strings "21st", "twentyfirst", or "1code.dev".

#### Scenario: Screen reader announces the correct product name

- **WHEN** a screen-reader user focuses a logo component rendered by `src/renderer/components/ui/logo.tsx` or `src/renderer/features/agents/ui/agent-preview.tsx`
- **THEN** the assistive-technology announcement SHALL contain "1Code" or the product-name display string
- **AND** the announcement SHALL NOT contain "21st"

### Requirement: Window and page titles use the current product name

The system SHALL use the current product name `1Code` in every user-visible window title, browser tab title, HTML `<title>` element, and native-window title string set via `BrowserWindow.setTitle()` or `app.setApplicationName()`.

#### Scenario: Login window title shows 1Code

- **WHEN** the login HTML page at `src/renderer/login.html` is rendered in a BrowserWindow
- **THEN** the window's `<title>` element SHALL contain "1Code"
- **AND** SHALL NOT contain "21st"

### Requirement: Windows AppUserModelId matches package.json appId

The system SHALL set the Windows `AppUserModelId` (via `app.setAppUserModelId()` in the main process) to a value that exactly matches the `build.appId` field in `package.json`, including both dev and production variants. The dev variant SHALL append `.dev` as a suffix to the production appId.

#### Scenario: Production build sets the production AppUserModelId

- **WHEN** the application starts with `IS_DEV === false`
- **THEN** `app.setAppUserModelId()` SHALL be called with the value of `build.appId` from `package.json`
- **AND** for the current rebranded state that value SHALL be `dev.apollosai.agents`

#### Scenario: Development build sets the development AppUserModelId

- **WHEN** the application starts with `IS_DEV === true`
- **THEN** `app.setAppUserModelId()` SHALL be called with the production appId suffixed by `.dev`
- **AND** for the current rebranded state that value SHALL be `dev.apollosai.agents.dev`

### Requirement: Protocol schemes are registered for both dev and production

The system SHALL register both the production URL scheme `apollosai-agents` and the development URL scheme `apollosai-agents-dev` in `package.json.build.protocols`, so that both packaged builds (production DMG/installer and packaged dev builds) bind the corresponding OS-level URL handler at install time.

#### Scenario: Packaged dev build can handle deep links to apollosai-agents-dev scheme

- **WHEN** a packaged development build (produced via `bun run package:mac` with `IS_DEV=true`) is installed on macOS
- **THEN** the resulting `Info.plist` SHALL contain a `CFBundleURLTypes` entry for the `apollosai-agents-dev` scheme
- **AND** clicking an `apollosai-agents-dev://...` link SHALL launch or focus the dev build

### Requirement: Filesystem paths for worktrees and repositories use the product-name directory

The system SHALL create, detect, and reference git worktrees under `~/.1code/worktrees/` and cloned repositories under `~/.1code/repos/`. The legacy path `~/.21st/` SHALL NOT be created or referenced by any code path.

#### Scenario: Worktree creation writes to the product-name directory

- **WHEN** a new worktree is created via the worktree creation flow in `src/main/lib/git/worktree.ts`
- **THEN** the worktree directory SHALL be created under `~/.1code/worktrees/`
- **AND** SHALL NOT be created under `~/.21st/worktrees/`

#### Scenario: Worktree detection regex matches the product-name directory

- **WHEN** a renderer-side parser at `src/renderer/features/agents/ui/agent-tool-registry.tsx`, `src/renderer/features/agents/hooks/use-changed-files-tracking.ts`, or `src/renderer/features/agents/utils/git-activity.ts` matches a filesystem path against its worktree-path regex
- **THEN** the regex SHALL match `~/.1code/worktrees/...` paths
- **AND** SHALL NOT match `~/.21st/worktrees/...` paths (because no such paths are created)

### Requirement: Theme identifiers and localStorage keys use the product-name namespace

The system SHALL use the product-name prefix `1code-` for all built-in theme IDs and theme-related localStorage keys. Legacy identifiers beginning with `21st-` SHALL NOT exist in the codebase.

#### Scenario: Built-in light theme has the product-name ID

- **WHEN** a consumer of `src/renderer/lib/themes/builtin-themes.ts` references the default light theme by ID
- **THEN** the ID SHALL be `1code-light`
- **AND** SHALL NOT be `21st-light`

#### Scenario: Built-in dark theme has the product-name ID

- **WHEN** a consumer of `src/renderer/lib/themes/builtin-themes.ts` references the default dark theme by ID
- **THEN** the ID SHALL be `1code-dark`
- **AND** SHALL NOT be `21st-dark`

#### Scenario: Session-info localStorage key uses the product-name prefix

- **WHEN** session info is persisted to localStorage via the atom defined in `src/renderer/lib/atoms/index.ts`
- **THEN** the storage key SHALL be `1code-session-info`
- **AND** SHALL NOT be `21st-session-info`

### Requirement: External URLs point at owned domains

The system SHALL NOT contain hardcoded external URLs pointing at domains it does not control. The forbidden domains include `1code.dev`, `21st.dev`, `cdn.21st.dev`, `auth.21st.dev`, and any `*.21st.*` subdomain.

#### Scenario: Changelog links point at the owned domain

- **WHEN** a user clicks a "View changelog" button or a post-update toast changelog link in `src/renderer/features/agents/components/agents-help-popover.tsx`, `src/renderer/components/update-banner.tsx`, or `src/renderer/lib/hooks/use-just-updated.ts`
- **THEN** the resulting `openExternal` call SHALL target a URL under `https://apollosai.dev`
- **AND** SHALL NOT target any URL under `1code.dev` or `21st.dev`

### Requirement: User-agent and OAuth client identity strings reflect the product name

The system SHALL use a current product-name string (`1Code` or `1code-desktop`) in every user-agent string, OAuth client name, MCP client name, and machine-identifying HTTP header it generates.

#### Scenario: Main process user-agent string identifies as 1Code

- **WHEN** the main process in `src/main/auth-manager.ts` constructs a user-agent string for an outbound HTTP request
- **THEN** the user-agent SHALL begin with `1Code` followed by the version number
- **AND** SHALL NOT begin with `21st Desktop`

#### Scenario: MCP client registers with the product-name identity

- **WHEN** the main process in `src/main/lib/mcp-auth.ts` registers an OAuth client with an MCP server
- **THEN** the registered `name` field SHALL be `1code-desktop`
- **AND** SHALL NOT be `21st-desktop`

### Requirement: Attribution files satisfy Apache License 2.0 §4(c) and §4(d)

The system SHALL include a legally-sound `LICENSE` file with an explicit copyright header (not an unfilled `[yyyy] [name of copyright owner]` placeholder) and a top-level `NOTICE` file that attributes the original upstream work.

- The `LICENSE` file SHALL contain the Apache License 2.0 body preceded by explicit copyright lines for both the original upstream work (as discoverable from `github.com/21st-dev/1Code/blob/main/LICENSE`) and the apollosai.dev fork.
- The `NOTICE` file SHALL exist at the repository root, SHALL name the upstream origin, and SHALL cite the Apache License 2.0 as the governing license.

#### Scenario: LICENSE file contains explicit copyright header

- **WHEN** a reader opens `LICENSE` at the repository root
- **THEN** the file SHALL contain an explicit copyright header naming the original upstream copyright holder and the apollosai.dev fork
- **AND** SHALL NOT contain the literal unfilled placeholder text `Copyright [yyyy] [name of copyright owner]`

#### Scenario: NOTICE file exists with fork attribution

- **WHEN** a reader opens `NOTICE` at the repository root
- **THEN** the file SHALL exist
- **AND** SHALL name the upstream origin as "1Code" or "21st-dev/1Code"
- **AND** SHALL cite the Apache License, Version 2.0 as the governing license
