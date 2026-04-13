---
title: Environment Gotchas
icon: alert-circle
---

# Environment Gotchas

## CI release gotchas (captured 2026-04-13 during v0.0.83 → v0.0.84 remediation)

### 1. `git push --follow-tags` skips lightweight tags

`git tag v0.0.XX` (no `-a`) creates a **lightweight** tag. `git push --follow-tags` only pushes **annotated** tags — it silently skips lightweight ones. The commit reaches `main`, but the release workflow never fires because the tag isn't on the remote.

**Fix patterns:**

- Annotated tag: `git tag -a v0.0.XX -m "v0.0.XX"`, then `git push origin main --follow-tags`
- Or push branch + tag explicitly in one command: `git push origin main v0.0.XX`

**Recovery** if a lightweight tag got stranded: `git push origin v0.0.XX` — the workflow picks it up as soon as the tag lands on the remote.

**Verify the tag actually reached the remote:**
```bash
git ls-remote --tags origin v0.0.XX     # should print SHA + refs/tags/v0.0.XX
gh run list --workflow=release.yml --limit 1   # should show the queued run
```

Canonical runbook: [`docs/operations/release.md`](./release.md).

### 2. Trivy `image-ref: ${{ github.sha }}` vs docker/metadata-action `type=sha`

`github.sha` is the full 40-char commit SHA. `docker/metadata-action` with `type=sha,prefix=` generates a **7-char** SHA tag by default. They don't match — Trivy looks up `@full-sha` and gets `MANIFEST_UNKNOWN`.

**Fix**: reference the image by **content digest** from `build-push-action.outputs.digest`, not by tag:

```yaml
- name: Build and push
  id: build
  uses: docker/build-push-action@v6
  # ...

- name: Run Trivy
  uses: aquasecurity/trivy-action@...
  with:
    image-ref: "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}"
```

Digest is immutable and content-addressed — strictly more correct than scanning-by-tag for supply-chain purposes. Applied to `.github/workflows/container-build.yml` on 2026-04-13.

### 3. Cosign signing uses build-push-action's digest output, not metadata-action's

`docker/metadata-action` does **not** output a `digest` field — that's exclusive to `docker/build-push-action`. If you wire Cosign with `${{ steps.meta.outputs.digest }}`, it resolves to empty and the `cosign sign --yes "${tag}@"` invocation fails; the `||` fallback then signs the mutable tag instead. Fixed on 2026-04-13 same commit as above.

### 4. GitHub electron-builder-binaries CDN flakes (Windows NSIS)

Electron-builder downloads `nsis-resources-*.7z` from `https://github.com/electron-userland/electron-builder-binaries/releases/download/...` during Windows packaging. GitHub release CDN occasionally returns 502 — flake frequency is ~1 in 20 Windows builds. No code fix; retry the failed Windows job.

First observed: v0.0.83 build run `24325021078` on 2026-04-13. v0.0.84 rebuild of the same workflow succeeded cleanly ~1 hour later.

**Recovery**: `gh run rerun <run-id> --failed` re-runs only the failed legs, preserves successful macOS/Linux artifacts.

### 5. `Required status check "CI Status" is expected` warning on branch-protection bypass

Every `git push origin main` with an admin-bypass ruleset prints:

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
remote: - Required status check "CI Status" is expected.
```

This is informational, not an error — the push succeeds. It means the ruleset wants a PR + CI status check, but the admin override let the direct push through. Safe to ignore for solo-dev flow; tighten the ruleset once multi-contributor is in play.

### 6. Trivy `.trivyignore` with justification comments

When a CVE has no remediation path in the base image yet (e.g., `CVE-2026-28390` in distroless `nodejs24-debian12` pending upstream rebuild), add the CVE ID to `/.trivyignore` (repo root) with full justification: source link, non-exploitability analysis for THIS service, remediation plan, expiry trigger.

The `aquasecurity/trivy-action` step wires this via `trivyignores: ".trivyignore"` input. Keep entries auditable — never add a CVE without the 5-line comment block explaining why.

## Legacy TODO (migrate from CLAUDE.md as needed)

- macOS base64url JWT decoding workaround
- `claude-mem` Read-tool deflection and workarounds
- Serena MCP activation requirement
- `postinstall` and native module rebuilds
- `tsgo` vs `tsc` differences
- Node TLS warning (`NODE_TLS_REJECT_UNAUTHORIZED=0`)

See CLAUDE.md "Environment Notes" section for the current source.
