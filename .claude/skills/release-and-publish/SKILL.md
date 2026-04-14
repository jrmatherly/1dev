---
name: release-and-publish
description: Bump version, tag, push, wait for CI build, and publish the GitHub release in one step
disable-model-invocation: true
---

# Release and Publish

Full release pipeline: version bump, commit, tag, push, wait for CI, and publish.

## Usage

```
/release-and-publish
/release-and-publish minor
```

Default is `patch`. Pass `minor` or `major` as argument.

## Steps

1. **Pre-flight checks:**
   - Working tree must be clean (`git status --short` empty)
   - All quality gates must pass (`ts:check`, `test`, `build`)
   - Current branch must be `main`

2. **Version bump:**
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```

3. **Commit + annotated tag + push:**
   ```bash
   git add package.json bun.lock
   git commit -m "chore: bump version to v<VERSION>"
   git tag -a v<VERSION> -m "v<VERSION>"
   git push origin main v<VERSION>
   ```

4. **Verify workflow fired:**
   ```bash
   git ls-remote --tags origin v<VERSION>
   gh run list --workflow=release.yml --limit 1
   ```

5. **Wait for build (~17 min):**
   ```bash
   gh run watch <run-id> --exit-status
   ```

6. **Publish the draft release:**
   ```bash
   gh release edit v<VERSION> --draft=false
   ```

7. **Report the release URL.**

## Important Notes

- The release workflow uses a **shared concurrency group with cancel-in-progress** — triggering a new release cancels any in-progress older build.
- Releases are created as **drafts** by the workflow. The publish step makes them visible.
- **Unsigned builds** — macOS users need `xattr -rd com.apple.quarantine /Applications/1Code.app`.
- If GitHub secrets `ENTRA_CLIENT_ID` and `ENTRA_TENANT_ID` are not set, enterprise auth will not work in the packaged build.
- See `docs/operations/release.md` for the full runbook.
