## Context

The enterprise fork of 1Code was decoupled from the upstream `21st.dev` / `1code.dev` brand in commit `9b6d525` (2026-04-08), which manually rebranded 31 files. A follow-up audit orchestrated by five parallel Explore subagents and captured in `openspec/specs/brand-identity/spec.md` identified 17 concrete residual hits across 14 files plus 2 attribution gaps (unfilled Apache 2.0 placeholder in `LICENSE`, missing `NOTICE` file).

The audit's original 4-phase remediation plan was written with a deployed-product assumption in mind — specifically, that renaming theme IDs, localStorage keys, or the `.21st/worktrees/` filesystem path would orphan user data. The user then confirmed the project is **greenfield**: zero deployments, zero installed users, no persisted data on any machine. That signal collapses the entire Tier C "user-data migration" category into trivial text replacements.

Current state of the rebrand (cleared by the audit, do NOT re-sweep):
- `package.json` fully rebranded: `appId: dev.apollosai.agents`, `homepage: apollosai.dev`, `author: apollosai.dev`, `publish.url: cdn.apollosai.dev/releases/desktop`
- `.github/workflows/`, `electron-builder.yml`, `build/entitlements.mac.plist`, `.env.example`, `openspec/config.yaml` — clean
- Runtime API routing via `getApiBaseUrl()` defaults to `https://apollosai.dev`
- The `"1Code"` product name and `1code-desktop` package name are intentionally retained per the commit `9b6d525` message

The residual hits are concentrated in five areas: Windows taskbar identity (`AppUserModelId`), user-agent / OAuth client name strings, dead external URLs that point at upstream domains, the hidden `.21st/` filesystem directory for worktrees, and theme IDs that leak the old brand into localStorage keys.

## Goals / Non-Goals

**Goals:**
- Zero residual references to `21st`, `twentyfirst`, or `1code.dev` in `src/`, `scripts/`, and `package.json`, with the sole deliberate exception of `src/main/lib/cli.ts:6` (a comment link to the upstream PR that introduced that code, preserved as historical attribution per Apache 2.0 §4(c))
- Filesystem path consistency: the hidden worktree directory name (`.21st/` → `.1code/`) and the per-worktree config filename (`.1code/worktree.json`) should agree — right now they disagree
- Apache 2.0 legal correctness: `LICENSE` has an explicit copyright header instead of the literal `Copyright [yyyy] [name of copyright owner]` placeholder; a top-level `NOTICE` file exists with fork attribution per §4(d)
- Accessibility correctness: `aria-label` attributes in logo components no longer announce "21st logo" to screen readers
- A **regression guard** under `tests/regression/` that fails if a future commit reintroduces any of the swept patterns, so the rebrand cannot silently drift again
- Single-commit remediation with the four quality gates (`ts:check`, `build`, `test`, `audit`) all green, zero new TypeScript errors introduced

**Non-Goals:**
- Changing the `"1Code"` product name, `1code-desktop` package name, or `resources/cli/1code` CLI launcher script name (these are Tier B — product name, intentionally kept per commit `9b6d525`)
- Removing the `README.md:3` "forked from 1Code by 21st.dev" attribution sentence (retained verbatim; only the link target shifts from the hosted domain `https://1code.dev` to the more durable GitHub repo `https://github.com/21st-dev/1Code`)
- Touching Phase 0 Gate #8 (upstream sandbox OAuth extraction from `src/main/lib/trpc/routers/claude-code.ts:178-220`). That refactor has its own strategy work underway in `.scratchpad/gate8-preliminary.md` and involves rearchitecting the OAuth redirect flow, not a text replacement
- Rewriting historical strategy documents under `.scratchpad/` (auth strategy, upstream features inventory, enterprise auth integration) or the `openspec/changes/retire-mock-api-translator/` proposal — all intentionally reference upstream as historical context
- Migrating existing user data in `~/.21st/worktrees/` — no such user data exists anywhere (greenfield)
- Visual inspection or regeneration of binary image assets (`build/icon.icns`, `build/icon.ico`, `build/icon.png`, `build/dmg-background.png`). Those need human review and are tracked as a separate optional follow-up commit — see proposal §Impact

## Decisions

### Decision 1: Three-tier brand taxonomy codified as a capability spec

The audit introduced a Tier A / Tier B / Tier C taxonomy to answer "what counts as upstream branding in this repo." Rather than leaving that taxonomy in a scratchpad document that future commits can ignore, codify it as an OpenSpec capability (`brand-identity`) with verifiable acceptance rules. Future rebrand audits will then inherit the same definitions, and any commit that reintroduces upstream brand strings can be rejected against the spec.

- **Tier A (MUST REMOVE):** Upstream domain and company identifiers — `21st.dev`, `1code.dev`, `cdn.21st.dev`, `github.com/21st-dev/*`, `@21st-dev/*` npm scope, `twentyfirst-agents://`, `dev.21st.*` app IDs, `21st-desktop`, `21st-notarize`
- **Tier B (KEEP):** Product-name identifiers owned by this fork — `"1Code"` (product name), `1code-desktop` (package name), `resources/cli/1code` (CLI launcher), `.1code/worktree.json` (per-worktree config file), any future `1code-*` prefixed identifier
- **Tier C (PRESERVE AS ATTRIBUTION):** Historical references that satisfy Apache 2.0 §4(c) — the `cli.ts:6` upstream PR link comment, the `README.md:3` "forked from" sentence, the `LICENSE` copyright header block (once added), the `NOTICE` file, and historical references inside documentation files under `.scratchpad/` and `openspec/changes/retire-mock-api-translator/`

**Alternative considered:** Leave the taxonomy in `openspec/specs/brand-identity/spec.md` only. **Rejected** because scratchpad documents are not treated as normative — the `retire-mock-api-translator` proposal explicitly quotes scratchpad context but doesn't *bind* against it. A capability spec is the durable home for acceptance rules that future PRs must respect.

### Decision 2: Filesystem path rename target is `.1code/`, not `.apollosai/`

The hidden worktree parent directory changes from `~/.21st/worktrees/` to `~/.1code/worktrees/`. The alternative was `~/.apollosai/worktrees/` (company-scoped).

**Chosen:** `.1code/` because:
- It matches the `1code-desktop` package name (intentional product identifier per commit `9b6d525`)
- It matches the already-existing per-worktree config filename `.1code/worktree.json` in `agents-project-worktree-tab.tsx` and `agents-worktrees-tab.tsx` — right now the parent directory (`.21st/`) and the config file (`.1code/worktree.json`) are inconsistent; renaming to `.1code/` resolves the inconsistency
- It keeps the repo on the existing convention "1Code = product, apollosai.dev = company/domain"

**Alternative considered:** `~/.apollosai/worktrees/` — **rejected** because it introduces a new top-level convention and doesn't match the existing `.1code/worktree.json` filename inside each worktree.

### Decision 3: Dead upstream URL replacement — point at `apollosai.dev/changelog` even if the page isn't live yet

The four `https://1code.dev/changelog` call sites will be repointed to `https://apollosai.dev/changelog`. The audit flagged that the destination page may not exist on `apollosai.dev` yet, and raised three options: (a) repoint anyway, (b) gate behind a feature flag, (c) convert to an in-app changelog view fed by the already-working `signedFetch("https://apollosai.dev/api/changelog/desktop?per_page=3")`.

**Chosen:** Option (a), plain repoint. Rationale:
- An honest 404 on an owned domain is better than a DNS failure on a stale upstream domain
- The app already uses `signedFetch("https://apollosai.dev/api/changelog/desktop?per_page=3")` successfully, so `apollosai.dev` is controlled — a 404 at `/changelog` is a hosting decision, not a domain-ownership problem
- Feature-flagging would require touching `src/main/lib/feature-flags.ts` (Phase 0 Gate #12 infrastructure) — disproportionate effort for a link swap
- Converting to an in-app changelog view is the right long-term solution but out of scope for a rebrand sweep; track as a separate openspec proposal

**Alternative considered:** Option (c), in-app changelog — **deferred** to a follow-up change proposal. Worth doing but not as part of a text-replacement sweep.

### Decision 4: Delete `scripts/sync-to-public.sh` instead of repointing it

The script at `scripts/sync-to-public.sh:17-20` currently points at `github.com/21st-dev/1code`. For an enterprise fork whose posture is "decouple from upstream, self-host everything," syncing *to* the upstream GitHub org is exactly backwards. There is no scenario where this script should run.

**Chosen:** Delete the script file + its `"sync:public"` npm script alias in `package.json:30`. Add a brief note to `CONTRIBUTING.md` (or similar) confirming no upstream mirror is maintained.

**Alternative considered:** Repoint the URLs to an `apollosai.dev` GitHub org — **rejected** because there is no public mirror planned. Keeping a dormant script with a dangerous default is a footgun.

### Decision 5: Regression guard using `bun:test` and the existing `tests/regression/` pattern

Phase 0 Gate #11 bootstrapped `bun:test` with five structural regression guards under `tests/regression/` (auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted, gpg-verification-present, feature-flags-shape). The rebrand sweep will add a sixth: `brand-sweep-complete.test.ts`.

The test will:
1. Read the contents of all files under `src/main/`, `src/renderer/`, `scripts/`, plus `package.json` and `README.md` (respecting the allowlist for the single permitted occurrence)
2. Assert that the patterns `21st`, `twentyfirst`, `1code.dev` (case-insensitive) do not appear outside the allowlist
3. Allowlist: `src/main/lib/cli.ts:6` (upstream PR attribution comment) and `README.md:3` (attribution sentence, with its updated GitHub link target)
4. Fail with a clear error message pointing at the offending file:line if a future commit reintroduces any of the patterns

**Alternative considered:** Add a grep command to the `prepush` hook or CI workflow — **rejected** because (a) CI already runs `bun test` as one of the four quality gates, so a test is the natural home; (b) tests run locally during `bun test` and fail fast in the dev loop, shell scripts in hooks run at push time; (c) a `.ts` test is easier to maintain and self-documenting compared to a cryptic shell regex.

## Risks / Trade-offs

- **[Risk]** Deleting `scripts/sync-to-public.sh` without checking if any external CI or cron job invokes it → Mitigation: The script lives inside this repo only; its only caller is the `"sync:public"` npm script in `package.json:30`, which this change also removes. No external invocations exist because the script has `21st-dev/1code` hardcoded — if anything external depended on it, that external thing is already broken. `grep -rn "sync-to-public" .` before deletion will confirm no other callers in the repo.
- **[Risk]** The regression guard may false-positive on legitimate historical references (e.g., if a future commit adds a strategy document at `.scratchpad/something.md` that mentions upstream) → Mitigation: Scope the test to `src/`, `scripts/`, `package.json`, and `README.md` ONLY. Explicitly exclude `.scratchpad/`, `.full-review/`, `openspec/changes/`, `.claude/`, `.serena/`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`. The three-tier taxonomy in the `brand-identity` capability spec lists exactly which surfaces are in scope for the guard.
- **[Risk]** `AppUserModelId` change may surface as a Windows taskbar quirk on the developer's own machine if they run a pre-rebrand packaged dev build and then a post-rebrand one → Mitigation: Document in the task list that dev machines with stale pinned taskbar entries from the old AppUserModelId should unpin + re-pin. Greenfield project → no production user impact.
- **[Risk]** The new `NOTICE` file and `LICENSE` copyright header may use a year or entity name that is legally inaccurate if the original upstream copyright holder is not actually "21st-dev" (e.g., the real legal entity could be a different named company or individual) → Mitigation: Before committing the `LICENSE` header, verify the upstream copyright holder by reading `github.com/21st-dev/1Code/blob/main/LICENSE`. If the upstream entity name differs, use the exact upstream entity name for the "original work" attribution line.
- **[Risk]** The `apollosai-agents-dev://` protocol entry added to `package.json.build.protocols` may change the macOS `Info.plist` CFBundleURLTypes structure and require a re-package+re-install → Mitigation: Greenfield, so no install base. After the change, run `rm -rf release && bun run package:mac && open release/mac-arm64/1Code.app` to verify the protocol registers. Document this in the tasks.
- **[Trade-off]** Theme IDs are being renamed (`21st-dark` → `1code-dark`) rather than made neutral (`default-dark`) → Chose product-name-scoped over neutral because the rest of the repo uses `1code-*` as its product identifier; neutral names would introduce a new convention without benefit.
- **[Trade-off]** The regression guard will treat `1code` (the product name) as an allowed substring but `1code.dev` (the upstream domain) as a forbidden substring. The regex must be precise: forbid `1code\.dev` but allow `1code-` and `1code/` and `1Code` → Accepted complexity in the test code.

## Migration Plan

Single commit lands all edits in one atomic change. No staged rollout, no feature flags, no reversible intermediate states. Rollback strategy is `git revert` of the single commit.

**Pre-implementation verification steps (to run before writing any edits):**

1. Confirm no `~/.21st/` directory exists on any developer machine (it does not on the current one — confirmed during audit)
2. Confirm no external process references `scripts/sync-to-public.sh`: `grep -rn "sync-to-public" .` should return only the script itself and the `package.json:30` alias
3. Snapshot the current TypeScript baseline: `bun run ts:check 2>&1 | grep -c "error TS"` (should report the known ~88 pre-existing errors) — the rebrand sweep must not increase this number
4. Confirm the upstream copyright holder name and year by reading `github.com/21st-dev/1Code` LICENSE file online, for use in the new `LICENSE` copyright header and `NOTICE` file

**Post-implementation verification steps:**

1. Run `bun run ts:check` — error count must equal or be less than the pre-sweep baseline (zero new errors)
2. Run `bun run build` — must succeed
3. Run `bun test` — all existing regression guards must still pass AND the new `brand-sweep-complete.test.ts` must pass
4. Run `bun audit` — no new vulnerabilities
5. Run the canonical verification grep:
   ```bash
   grep -rniE "21st|twentyfirst|1code\.dev" \
     src/main/ src/renderer/ scripts/ package.json README.md \
     --include='*.ts' --include='*.tsx' --include='*.html' --include='*.mjs' --include='*.sh' --include='*.json' --include='*.md' \
     | grep -vE 'github\.com/21st-dev/1Code|src/main/lib/cli\.ts'
   ```
   Expected output: empty
6. Smoke-test the dev build: `bun run dev` and verify window titles, login screen title, logo `aria-label` via browser devtools accessibility panel, and that clicking "changelog" in the help popover opens `apollosai.dev/changelog` (even if it 404s, the domain should be correct)
7. Package a macOS dev build: `rm -rf release && bun run package:mac` and verify the `Info.plist` `CFBundleURLTypes` contains both `apollosai-agents` and `apollosai-agents-dev` entries

**Rollback:** `git revert <sha>` of the single commit. No database migrations to reverse, no feature flags to toggle, no external systems to coordinate.
