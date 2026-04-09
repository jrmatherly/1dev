## Why

Commit `9b6d525` ("chore: rebrand 21st.dev -> apollosai.dev + doc drift remediation", 2026-04-08) landed a manual first-pass rebrand across 31 files, but a follow-up audit captured in `openspec/specs/brand-identity/spec.md` found **17 concrete residual hits across 14 files** plus **2 attribution gaps** (missing `LICENSE` copyright header, no `NOTICE` file). The residual references will break functionality on Windows (`AppUserModelId` mismatch with `package.json.appId`), leak old branding into user-visible UI (`aria-label="21st logo"`, `login.html` title), point at dead upstream domains (4 `https://1code.dev/changelog` call sites), and leave the fork without legally-sound Apache 2.0 attribution. Because this is a greenfield project with zero deployments, the sweep can land as a single commit without migration shims, feature flags, or release-note warnings — the audit's original 4-phase remediation plan collapses to one unified commit.

## What Changes

- **Rename Windows `AppUserModelId`** in `src/main/index.ts:600` from `dev.21st.1code[.dev]` to `dev.apollosai.agents[.dev]` (matches `package.json.build.appId`)
- **Replace 4 dead upstream changelog URLs** (`https://1code.dev/agents/changelog`, `/changelog`) with the self-hosted `https://apollosai.dev/changelog` equivalent in `agents-help-popover.tsx`, `update-banner.tsx`, `use-just-updated.ts`
- **Fix 3 logo `aria-label="21st logo"` accessibility leaks** in `logo.tsx` and `agent-preview.tsx`
- **Rebrand user-agent / client-identity strings**: `auth-manager.ts` (`21st Desktop`), `mcp-auth.ts` × 2 (`21st-desktop` MCP client name), `scripts/download-codex-binary.mjs` (`21st-desktop-codex-downloader` UA)
- **Rename filesystem paths** `~/.21st/worktrees/` → `~/.1code/worktrees/` and `~/.21st/repos/` → `~/.1code/repos/` across 7 files (worktree detection/creation and renderer-side path regex parsers). This also resolves a pre-existing inconsistency: the hidden parent directory was `.21st/` but the config file inside each worktree is already `.1code/worktree.json`
- **Rename theme IDs and localStorage key**: `21st-dark` → `1code-dark`, `21st-light` → `1code-light`, `21st-session-info` → `1code-session-info` (11 call sites across 5 files), plus display names `"21st Dark"` → `"1Code Dark"` etc.
- **Update `src/renderer/login.html:9`** title to `<title>1Code - Login</title>`
- **Add `apollosai-agents-dev://` scheme** to `package.json.build.protocols` array (currently only `apollosai-agents://` is registered, so packaged dev builds cannot bind the dev scheme via `Info.plist` / registry)
- **Delete `scripts/sync-to-public.sh`** and its `"sync:public"` npm script alias — the greenfield enterprise fork has no upstream mirror to sync to; the script currently targets `git@github.com:21st-dev/1code.git`
- **Update documentation comments** in `remote-types.ts`, `remote-app-router.ts`, theme files to describe "legacy upstream contract" instead of present-tense "21st.dev tRPC client"
- **Update `README.md:3` attribution link** from `https://1code.dev` to the more durable `https://github.com/21st-dev/1Code`
- **Add copyright header to `LICENSE`** replacing the literal `Copyright [yyyy] [name of copyright owner]` Apache 2.0 placeholder with explicit 21st-dev (original) + apollosai.dev (fork) attribution
- **Create new `NOTICE` file** at repo root with Apache 2.0 Section 4(d) fork attribution
- **PRESERVED DELIBERATELY** (explicit non-changes documented in the capability spec):
  - `src/main/lib/cli.ts:6` — upstream PR link as historical attribution
  - `README.md:3` — "forked from" line (target link updated, sentiment retained)
  - `"1Code"` product name, `1code-desktop` package name, `resources/cli/1code` CLI launcher (all Tier B — product name, not upstream brand)
  - `docs/enterprise/upstream-features.md`, `auth-strategy-envoy-gateway.md`, `enterprise-auth-integration-strategy.md`, and `openspec/changes/retire-mock-api-translator/*` — intentional historical context

## Capabilities

### New Capabilities
- `brand-identity`: Codifies the enterprise fork's three-tier brand taxonomy (upstream brand = remove, product name = keep, attribution = preserve), enumerates the surfaces where each tier applies (user-agent strings, OAuth client names, theme IDs, filesystem paths, window titles, accessibility labels, external URLs, license/notice files), and defines verifiable acceptance rules so future commits cannot regress the rebrand.

### Modified Capabilities
<!-- None — this is the first capability spec introduced to the project. -->

## Impact

**Affected code (35 numbered edits across 17 files):**

| Area | Files |
|---|---|
| Main process | `src/main/index.ts`, `src/main/auth-manager.ts`, `src/main/lib/mcp-auth.ts`, `src/main/lib/claude-config.ts`, `src/main/lib/git/worktree.ts`, `src/main/lib/trpc/routers/projects.ts` |
| Renderer HTML/JSX | `src/renderer/login.html`, `src/renderer/components/ui/logo.tsx`, `src/renderer/features/agents/ui/agent-preview.tsx` |
| Renderer runtime (URLs, themes, regexes) | `src/renderer/features/agents/components/agents-help-popover.tsx`, `src/renderer/components/update-banner.tsx`, `src/renderer/lib/hooks/use-just-updated.ts`, `src/renderer/lib/themes/builtin-themes.ts`, `src/renderer/lib/themes/diff-view-highlighter.ts`, `src/renderer/lib/themes/shiki-theme-loader.ts`, `src/renderer/lib/atoms/index.ts`, `src/renderer/features/agents/ui/agent-tool-registry.tsx`, `src/renderer/features/agents/hooks/use-changed-files-tracking.ts`, `src/renderer/features/agents/utils/git-activity.ts`, `src/renderer/features/details-sidebar/sections/info-section.tsx`, `src/renderer/features/agents/ui/preview-url-input.tsx`, `src/renderer/lib/remote-types.ts`, `src/renderer/lib/remote-app-router.ts` |
| Scripts & config | `scripts/download-codex-binary.mjs`, delete `scripts/sync-to-public.sh`, `package.json` (protocols + scripts) |
| Docs & legal | `README.md`, `LICENSE`, new `NOTICE` file |

**APIs / dependencies:** No API surface changes. No dependency additions or removals. No database schema changes. No IPC contract changes (the `apollosai-agents-dev://` protocol addition in `package.json.build.protocols` is already used at runtime via `app.setAsDefaultProtocolClient`; registering it in the manifest is defense-in-depth for packaged dev builds).

**Quality gates:** The standard four (`bun run ts:check`, `bun run build`, `bun test`, `bun audit`) must all pass. The pre-existing ts:check baseline of ~88 errors must not increase — this change should introduce zero new TypeScript errors because every edit is a text replacement in strings, not type-level changes.

**Regression protection:** Introduce (or verify) a regression-guard test under `tests/regression/` that runs the canonical verification grep — searching `src/main/`, `src/renderer/`, `scripts/`, `package.json` for `21st|twentyfirst|1code\.dev` and asserting the only survivor is `src/main/lib/cli.ts:6` (the deliberately-kept upstream PR attribution comment). This prevents future drift.

**Cross-repo coordination:** None. This change lives entirely in `ai-coding-cli` and does not touch the Talos AI cluster config in `/Users/jason/dev/ai-k8s/talos-ai-cluster/`.

**Out of scope (tracked separately):**
- Phase 0 Gate #8 — upstream sandbox OAuth extraction from `src/main/lib/trpc/routers/claude-code.ts:178-220`. This is a larger refactor with its own strategy work (`.scratchpad/gate8-preliminary.md` is open in the IDE). It contains `sandbox_id` references tied to the upstream sandbox OAuth redirect host, but fixing it means rearchitecting the OAuth flow to use a localhost-loopback redirect, not a text replacement.
- Binary icon visual inspection — `build/icon.icns`, `build/icon.ico`, `build/icon.png`, `build/dmg-background.png`. Requires human visual review (see audit §7). If any contain upstream wordmarks, a follow-up commit regenerates them via `bun run icon:generate`.
- Historical references in `.scratchpad/*.md` strategy documents and the `openspec/changes/retire-mock-api-translator/` proposal — intentional context, do not sweep.
