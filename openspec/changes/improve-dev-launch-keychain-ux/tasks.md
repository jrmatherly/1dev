## 1. Create the standalone macOS dev-setup docs page

- [ ] 1.1 Create `docs/operations/dev-setup-macos.md` with sections: Overview, Symptom, Why, Why we don't automate this, Setup (7 numbered steps including full-Xcode-not-CLI-Tools note), Verification, Renewal (1 year, auto-renew in Xcode), Troubleshooting (4+ recipes: wrong button click → `security delete-generic-password`; post-`bun install` re-sign; multiple identities; reinstalled Electron), Official references (Apple KB links only), and Alternative: live with the prompts (opt-out subsection). Include the vetted `codesign --force --deep --sign <identity> --timestamp=none --preserve-metadata=entitlements,requirements <Electron.app>` command verbatim.
- [ ] 1.2 Cite Apple canonical references only (no third-party blogs): `developer.apple.com/support/compare-memberships/`, `developer.apple.com/help/account/certificates/certificates-overview/`, and `developer.apple.com/documentation/Xcode/sharing-your-teams-signing-certificates`.
- [ ] 1.3 Ensure the page renders correctly under xyd-js by running `cd docs && bun run build` and verifying no build errors and no broken anchors.

## 2. Register the new page in the xyd-js navigation

- [ ] 2.1 Edit `docs/docs.json` to add a sidebar entry for `operations/dev-setup-macos` under the Operations tab (adjacent to the existing `operations/env-gotchas` entry).
- [ ] 2.2 Re-run `cd docs && bun run build` and visually confirm the new nav entry renders (xyd dev server or static build output).

## 3. Add discoverability link from CLAUDE.md

- [ ] 3.1 Edit `CLAUDE.md` "Dev environment quick reference" section to add a single bullet pointing at the new docs page. The bullet must describe the symptom briefly so a developer hitting the prompts knows to click through.
- [ ] 3.2 Verify the link path is correct: relative path from `CLAUDE.md` to `docs/operations/dev-setup-macos.md`.

## 4. Add deferred entries to the roadmap

- [ ] 4.1 Edit `docs/operations/roadmap.md` to add a P2 entry for **Option C — lazy credential decryption** (defer tRPC queries that call `decryptCredential()` on renderer mount until the user opens a chat or settings panel). Include: scope, motivation, effort estimate, prereqs (none), and canonical reference (the new `docs/operations/dev-setup-macos.md` page).
- [ ] 4.2 Edit `docs/operations/roadmap.md` to add a P3 entry for **Future automation revisit** — reconsider signing automation if (a) 3+ contributors join the fork or (b) an OSS cross-project Electron-dev-sign helper emerges that absorbs the audit's five code-quality concerns. Include: scope, motivation, triggers, prereqs, and cross-reference to this OpenSpec change's `design.md` for the rationale.
- [ ] 4.3 Confirm no `.scratchpad/` references land in `docs/operations/roadmap.md` (the canonical ref line must point to tracked files only) per `.claude/rules/scratchpad.md`.

## 5. Verify scratchpad rule compliance

- [ ] 5.1 Run `bun test tests/regression/no-scratchpad-references.test.ts` and confirm pass — no tracked file (including the new docs page, updated `CLAUDE.md`, or updated `roadmap.md`) may reference the `.scratchpad/` directory.
- [ ] 5.2 Spot-check by grepping: `grep -rn '.scratchpad/' docs/operations/dev-setup-macos.md docs/operations/roadmap.md CLAUDE.md openspec/changes/improve-dev-launch-keychain-ux/proposal.md openspec/changes/improve-dev-launch-keychain-ux/design.md openspec/changes/improve-dev-launch-keychain-ux/tasks.md openspec/changes/improve-dev-launch-keychain-ux/specs/README.md` and confirm no hits (except this task line itself, which is allowed since it is within the `openspec/changes/` change tree that will not be committed with scratchpad references).

## 6. Run the five CI-enforced quality gates

- [ ] 6.1 `bun run ts:check` — confirm baseline count is unchanged (no TS changes in this PR).
- [ ] 6.2 `bun run build` — confirm electron-vite build still succeeds (no build-config changes expected; this is a safety check).
- [ ] 6.3 `bun test` — confirm regression guards all pass (25 guards + service tests; ~8s).
- [ ] 6.4 `bun audit` — confirm no new advisories (no dependency changes expected).
- [ ] 6.5 `cd docs && bun run build` — confirm xyd-js docs site builds clean with the new page wired into nav. This is the **primary gate** for this change.
- [ ] 6.6 (advisory) `bun run lint` — confirm no new lint findings in tracked files edited by this change.

## 7. OpenSpec workflow wrap-up

- [ ] 7.1 Run `openspec validate improve-dev-launch-keychain-ux` to confirm proposal + design + specs + tasks are coherent.
- [ ] 7.2 Invoke `/openspec-verify-change improve-dev-launch-keychain-ux` skill to verify implementation matches the change artifacts.
- [ ] 7.3 Commit all changes as a single PR titled "docs: add macOS dev keychain prompt mitigation guide" with body referencing this OpenSpec change name.
- [ ] 7.4 After merge, invoke `/openspec-archive-change improve-dev-launch-keychain-ux` to move the change into `openspec/changes/archive/YYYY-MM-DD-improve-dev-launch-keychain-ux/`.

## 8. Drift sync

- [ ] 8.1 Invoke `/session-sync` skill to rebuild the code-review graph, update Serena memories, refresh `CLAUDE.md` active-changes list, and check roadmap drift after the change lands.
