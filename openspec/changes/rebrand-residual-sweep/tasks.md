## 1. Pre-implementation verification

- [x] 1.1 Confirm no `~/.21st/` directory exists on the developer machine — confirmed: "No such file or directory"
- [x] 1.2 Confirm no external caller of `scripts/sync-to-public.sh` — confirmed: only `package.json:29` ("sync:public" alias) calls the script; 3 additional doc references found (`.serena/memories/suggested_commands.md:48`, `.claude/PROJECT_INDEX.md:179`, `CLAUDE.md:339`) which were swept as part of §10 cleanup
- [x] 1.3 Capture the pre-sweep TypeScript baseline: **88 errors** (matches expected baseline)
- [x] 1.4 Upstream copyright: repo `github.com/21st-dev/1code` (lowercase `1code`), owner is GitHub org `21st-dev`, created 2026-01-14. Upstream LICENSE itself never filled in the `[yyyy] [name of copyright owner]` placeholder. Attribution cites `21st-dev` as the org, uses `2026` for both upstream and fork copyright.
- [x] 1.5 Runtime protocol registration confirmed at `src/main/index.ts:255,267` — `package.json` protocol change is defense-in-depth for packaged dev builds

## 2. Main process — Windows identity, user agent, MCP client

- [x] 2.1 `src/main/index.ts:600` — AppUserModelId changed to `dev.apollosai.agents[.dev]`
- [x] 2.2 `src/main/auth-manager.ts:87` — user-agent helper returns `1Code ${version} (...)`
- [x] 2.3 `src/main/lib/mcp-auth.ts:42` — `name: "1code-desktop"` (OAuth client registration)
- [x] 2.4 `src/main/lib/mcp-auth.ts:104` — `name: "1code-desktop"` (token request)

## 3. Main process — Filesystem path rename (.21st → .1code)

- [x] 3.1 `src/main/lib/claude-config.ts:235-236` — docstring updated to `~/.1code/worktrees/...`
- [x] 3.2 `src/main/lib/claude-config.ts:244` — `path.join(".1code", "worktrees")`
- [x] 3.3 `src/main/lib/claude-config.ts:257-258` — comment + `path.join(os.homedir(), ".1code", "worktrees")`
- [x] 3.4 `src/main/lib/git/worktree.ts:930` — `join(homedir(), ".1code", "worktrees")`
- [x] 3.5 `src/main/lib/trpc/routers/projects.ts:278` — comment updated to `~/.1code/repos/{owner}/{repo}`
- [x] 3.6 `src/main/lib/trpc/routers/projects.ts:280` — `join(homePath, ".1code", "repos", owner)`
- [x] 3.7 `src/main/lib/trpc/routers/projects.ts:467` — comment updated to `~/.1code/repos/`
- [x] 3.8 `src/main/lib/trpc/routers/projects.ts:469` — `join(homePath, ".1code", "repos")`

## 4. Main process — Preserve deliberate attribution

- [x] 4.1 `src/main/lib/cli.ts:6` — upstream PR comment link verified present and UNCHANGED (Tier C allowlist entry)

## 5. Renderer — HTML titles and accessibility labels

- [x] 5.1 `src/renderer/login.html:9` — `<title>1Code - Login</title>`
- [x] 5.2 `src/renderer/components/ui/logo.tsx:20` — `aria-label="1Code logo"`
- [x] 5.3 `src/renderer/features/agents/ui/agent-preview.tsx:498` — `aria-label="1Code logo"` (via `replace_all`)
- [x] 5.4 `src/renderer/features/agents/ui/agent-preview.tsx:585` — same

## 6. Renderer — Dead upstream URL replacement (4 call sites)

- [x] 6.1 `src/renderer/features/agents/components/agents-help-popover.tsx:110` — repointed to `https://apollosai.dev/changelog`
- [x] 6.2 `src/renderer/features/agents/components/agents-help-popover.tsx:115` — repointed to `` `https://apollosai.dev/changelog#${version}` ``
- [x] 6.3 `src/renderer/components/update-banner.tsx:140` — repointed to `https://apollosai.dev/changelog`
- [x] 6.4 `src/renderer/lib/hooks/use-just-updated.ts:55` — repointed to `` `https://apollosai.dev/changelog${version}` `` (the `version` variable already contains the `#v` anchor prefix, no further change needed)
- [x] 6.5 `signedFetch("https://apollosai.dev/api/changelog/desktop?per_page=3")` at ~line 80 confirmed UNCHANGED (already correctly branded)

## 7. Renderer — Theme IDs, display names, localStorage keys

- [x] 7.1 `src/renderer/lib/themes/builtin-themes.ts:16` — `id: "1code-dark"`
- [x] 7.2 `src/renderer/lib/themes/builtin-themes.ts` — `name: "1Code Dark"`
- [x] 7.3 `src/renderer/lib/themes/builtin-themes.ts:80` — `id: "1code-light"`
- [x] 7.4 `src/renderer/lib/themes/builtin-themes.ts` — `name: "1Code Light"`
- [x] 7.5 `src/renderer/lib/themes/builtin-themes.ts:12` — comment updated to `1Code Dark - Default dark theme`
- [x] 7.6 `src/renderer/lib/themes/builtin-themes.ts:76` — comment updated to `1Code Light - Default light theme`
- [x] 7.7 `src/renderer/lib/themes/builtin-themes.ts:926` — comment updated to `// 1Code Default themes (first)`
- [x] 7.8 `src/renderer/lib/themes/builtin-themes.ts:963` — `DEFAULT_LIGHT_THEME_ID = "1code-light"`
- [x] 7.9 `src/renderer/lib/themes/builtin-themes.ts:964` — `DEFAULT_DARK_THEME_ID = "1code-dark"`
- [x] 7.10 `src/renderer/lib/themes/diff-view-highlighter.ts:27` — mapping key `"1code-dark"`
- [x] 7.11 `src/renderer/lib/themes/diff-view-highlighter.ts:28` — mapping key `"1code-light"`
- [x] 7.12 `src/renderer/lib/themes/diff-view-highlighter.ts:95` — `currentThemeId = "1code-dark"`
- [x] 7.13 `src/renderer/lib/themes/shiki-theme-loader.ts:96` — mapping key `"1code-dark"`
- [x] 7.14 `src/renderer/lib/themes/shiki-theme-loader.ts:97` — mapping key `"1code-light"`
- [x] 7.15 `src/renderer/lib/themes/shiki-theme-loader.ts:95` — comment updated to `// 1Code themes use GitHub themes (no tokenColors)`
- [x] 7.16 `src/renderer/lib/atoms/index.ts:582` — `"1code-light"` default
- [x] 7.17 `src/renderer/lib/atoms/index.ts:592` — `"1code-dark"` default
- [x] 7.18 `src/renderer/lib/atoms/index.ts:876` — `"1code-session-info"` localStorage key

**Bonus edits not in original task list but required for consistency:** the local JS identifiers `TWENTYFIRST_DARK` / `TWENTYFIRST_LIGHT` in `builtin-themes.ts` were also renamed to `ONE_CODE_DARK` / `ONE_CODE_LIGHT` (JavaScript identifiers cannot start with a digit, so the literal `1CODE_DARK` is invalid).

## 8. Renderer — Path-regex parsers

- [x] 8.1 `src/renderer/features/agents/ui/agent-tool-registry.tsx:81-84` — regex updated to `.1code/worktrees`
- [x] 8.2 `src/renderer/features/agents/hooks/use-changed-files-tracking.ts:61-65` — regex updated to `.1code/worktrees`
- [x] 8.3 `src/renderer/features/agents/utils/git-activity.ts:164` — comment + regex updated
- [x] 8.4 `src/renderer/features/details-sidebar/sections/info-section.tsx:298` — JSX comment updated to `~/.1code/worktrees/`

**Additional finding caught by regression guard:** `src/renderer/features/details-sidebar/sections/info-section.tsx:176` contained a runtime `.includes(".21st/worktrees")` check that the audit missed — fixed to `.includes(".1code/worktrees")`.

## 9. Renderer — Documentation comments and sandbox URL example

- [x] 9.1 `src/renderer/lib/remote-types.ts:2` — rewritten to describe "legacy upstream tRPC client" without the literal "21st.dev" string (regression guard caught an earlier draft that still contained the literal)
- [x] 9.2 `src/renderer/lib/remote-app-router.ts:2` — same rewrite
- [x] 9.3 `src/renderer/features/agents/ui/preview-url-input.tsx:14` — example updated to `"sandbox-3000.apollosai.dev"`
- [x] 9.4 `src/renderer/features/agents/ui/preview-url-input.tsx:124` — inline comment updated

## 10. Scripts — User agent and sync script deletion

- [x] 10.1 `scripts/download-codex-binary.mjs:24` — `USER_AGENT = "1code-desktop-codex-downloader"`
- [x] 10.2 `scripts/sync-to-public.sh` — DELETED
- [x] 10.3 `package.json:29` — `"sync:public"` alias DELETED from the `scripts` object

**Bonus documentation cleanup:** references to the deleted `sync:public` command in `CLAUDE.md:339`, `.claude/PROJECT_INDEX.md:179`, and `.serena/memories/suggested_commands.md:48` were also removed to prevent broken-command references.

## 11. Configuration — Register dev protocol scheme

- [x] 11.1 `package.json` `build.protocols` — added `{ "name": "1Code (Dev)", "schemes": ["apollosai-agents-dev"] }` as the second entry
- [x] 11.2 Verified the resulting array has exactly 2 entries with the existing production entry unchanged

## 12. Documentation — README attribution link

- [x] 12.1 `README.md:5` — attribution link swapped from `https://1code.dev` to `https://github.com/21st-dev/1code` (lowercase `1code` — the canonical upstream repo name). README.md lines 33 and 134 were intentionally left unchanged — line 33 describes the historical upstream backend dependency, line 134 is a "looking for the upstream OSS product?" pointer that correctly routes users to the actual hosted upstream product. Both are Tier C (attribution / practical routing) per the brand-identity capability spec and are covered by the README.md entry in the regression guard's ALLOWLIST_FILES.

## 13. Attribution — LICENSE header and NOTICE file

- [x] 13.1 `LICENSE` — added two-entity copyright header block (21st-dev 2026 + apollosai.dev 2026) above the Apache 2.0 body. The APPENDIX `Copyright [yyyy] [name of copyright owner]` placeholder was also replaced with the same two explicit copyright lines.
- [x] 13.2 `NOTICE` — CREATED new file at the repository root with full fork attribution (upstream origin + both copyright lines + governing license citation)

## 14. Regression guard — bun:test

- [x] 14.1 Created `tests/regression/brand-sweep-complete.test.ts` importing `describe`, `test`, `expect` from `bun:test`
- [x] 14.2 Test walks `src/main/`, `src/renderer/`, `scripts/`, reads `package.json` + `README.md`, matches `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.html`, `.json`, `.sh`, `.md` extensions against `/21st/i`, `/twentyfirst/i`, `/1code\.dev/i`
- [x] 14.3 Allowlist is file-level (entire file exempted): `src/main/lib/cli.ts` (upstream PR attribution) and `README.md` (attribution + historical + upstream-pointer). File-level allowlisting is simpler than line-number allowlisting and survives future edits within the allowlisted files.
- [x] 14.4 Error message names each offending `file:line`, shows the matched snippet, names the regex pattern, and instructs the contributor on how to add a Tier C exemption (the entire file must be added to `ALLOWLIST_FILES` with a justifying comment)
- [x] 14.5 Test does NOT walk `.scratchpad/`, `.full-review/`, `openspec/`, `.claude/`, `.serena/`, `node_modules/`, `.git/`, `release/`, `out/`, `dist/`, `drizzle/meta/`, `tests/` itself, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md` — the `walkFiles` generator skips all dot-prefixed directories automatically, and the scan targets are restricted to SCAN_DIRS + SCAN_FILES
- [x] 14.6 Test runs and passes in isolation: `bun test tests/regression/brand-sweep-complete.test.ts` → `1 pass, 0 fail, 184ms`

## 15. Quality gates

- [x] 15.1 `bun run ts:check` = **88 errors** (matches pre-sweep baseline — zero new errors introduced)
- [x] 15.2 `bun run build` = success in 46.27s
- [x] 15.3 `bun test` = **14 pass, 0 fail** (13 previous + 1 new brand-sweep guard)
- [x] 15.4 `bun audit` = 57 pre-existing vulnerabilities (all in transitive dev deps: picomatch, tinyglobby, @electron/rebuild chain) — zero NEW vulnerabilities introduced by this sweep

## 16. Canonical verification grep

- [x] 16.1 Canonical grep with Tier C allowlist exclusions returned empty output — no remaining Tier A identifiers outside the two allowlisted files
- [x] 16.2 No iteration needed — first pass returned empty

## 17. Smoke test — dev build (HUMAN VERIFICATION REQUIRED)

- [ ] 17.1 Run `bun run dev` and launch the app
- [ ] 17.2 Verify the main window title contains `1Code` (not `21st`)
- [ ] 17.3 Verify the login window title is `1Code - Login`
- [ ] 17.4 Open browser devtools accessibility panel on the main window and verify the logo `aria-label` is `1Code logo`
- [ ] 17.5 Click the changelog link in the help popover and verify it opens `https://apollosai.dev/changelog` (the page may 404 if not yet live, but the domain must be correct)
- [ ] 17.6 Create a new worktree and verify the worktree directory appears at `~/.1code/worktrees/...`

## 18. Smoke test — packaged dev build (HUMAN VERIFICATION REQUIRED)

- [ ] 18.1 Run `rm -rf release && bun run package:mac` (multi-minute build with signing prompts)
- [ ] 18.2 Inspect the packaged `Info.plist`: `plutil -p "release/mac-arm64/1Code.app/Contents/Info.plist" | grep -A10 CFBundleURLTypes`
- [ ] 18.3 Verify both `apollosai-agents` AND `apollosai-agents-dev` schemes appear in the `CFBundleURLTypes` array

## 19. Pre-commit final review

- [x] 19.1 `git diff --stat` — 31 modified files, 1 deleted (`scripts/sync-to-public.sh`), 2 new files (`NOTICE`, `tests/regression/brand-sweep-complete.test.ts`), plus the openspec change artifacts. Unrelated untracked file `.claude/skills/verify-strategy-compliance/` left out of this commit.
- [x] 19.2 `git diff` spot-checked — only rebrand edits landed, no inadvertent formatting changes
- [x] 19.3 Final grep confirms no stray `.21st`, `1code.dev`, `twentyfirst`, or `21st-desktop` references remain outside the Tier C allowlist

## 20. Commit and archive

- [ ] 20.1 Create single commit — PENDING user confirmation (awaiting go-ahead before `git commit`)
- [ ] 20.2 Archive change via `openspec archive rebrand-residual-sweep` — PENDING commit
