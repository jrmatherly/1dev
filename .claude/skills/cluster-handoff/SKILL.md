---
name: cluster-handoff
description: Generate a self-contained handoff prompt for the Talos cluster repo (/Users/jason/dev/ai-k8s/talos-ai-cluster/) when a change in this repo needs matching cluster-side work (Envoy SecurityPolicy, LiteLLM config, Flux sync, deploy/** manifests). Produces a pasteable prompt with current-change context, pinned cluster commit, cluster-side scope, and the "trust-the-edge + LiteLLM OSS only" rules so the cluster-side agent has full context without this session.
---

# Cluster Handoff Prompt Generator

This skill templates a self-contained prompt for the Talos cluster repo's Claude Code agent. Use it when a change in this repo (the 1Code Electron app + 1code-api service) requires matching cluster-side work that can't be done here.

## Why this skill exists

The Electron app and the `services/1code-api/` service are deployed to a cluster repo at `/Users/jason/dev/ai-k8s/talos-ai-cluster/`. Typical cross-repo scenarios:

- Adding a new Envoy `HTTPRoute` to expose a new API endpoint
- Modifying `SecurityPolicy` to accept a new JWT claim
- Updating LiteLLM `teams.yaml` / `routes.yaml` for a new account type
- Rolling a new `1code-api` container image via Flux `ImagePolicy`
- Adding a Kubernetes `Secret` (via SOPS) for a new credential

Currently each of these requires hand-writing a self-contained prompt with:

1. What change in THIS repo triggered the work
2. What cluster-side artifacts need to change
3. What invariants (trust-the-edge, LiteLLM OSS, Flux v2, Talos) apply
4. How the cluster-side agent should verify

This skill emits that prompt with the current session's context pre-filled.

## When NOT to use

- **Same-repo work** — if the change is fully in `src/` or `services/1code-api/` or `deploy/**`, there's no cluster handoff. Use `/opsx:apply` or direct edit.
- **Upstream F-entry restoration** — that's handled by the `upstream-dependency-auditor` subagent; cluster handoff is about forward work, not reverse-engineering existing patterns.
- **Documentation-only changes** — cluster repo has its own docs; a handoff isn't needed just to reflect state.

## Execution workflow

### Step 1 — Gather local context

```bash
# Identify the current active change in flight
bunx @fission-ai/openspec@1.2.0 list --json 2>/dev/null | jq -r '.changes[] | select(.status == "in-progress") | "\(.name) (\(.completedTasks)/\(.totalTasks))"'

# Current commit on this repo
git log -1 --format='%h %s'

# Current pinned versions
grep -E '"electron"|"electron-vite"|"bun"' package.json
```

Offer these to the user for the "which change is this handoff for?" prompt fill-in.

### Step 2 — Read the cluster repo's current state

```bash
# Pinned cluster commit (if the user wants to reference a frozen state)
cd /Users/jason/dev/ai-k8s/talos-ai-cluster/ 2>/dev/null && git log -1 --format='%h %s' 2>/dev/null

# Envoy Gateway version + LiteLLM version + Flux version
cd /Users/jason/dev/ai-k8s/talos-ai-cluster/ 2>/dev/null && \
  grep -rE "image: envoyproxy/envoy|image: ghcr.io/berriai/litellm|image: ghcr.io/fluxcd" --include="*.yaml" 2>/dev/null | head -5
```

If the cluster repo isn't checked out locally, cite `docs/operations/cluster-access.md` for coordinates instead.

### Step 3 — Collect the scope inputs from the user

Ask the user (short form — if they already know, they can skip):

1. **Cluster-side artifact** (pick one or more): HTTPRoute / SecurityPolicy / LiteLLM config / Flux manifest / Secret (SOPS) / other
2. **Blocking or non-blocking?** — if blocking, this repo's change can't merge until cluster-side lands
3. **Rollback plan** — how to revert cluster-side if the change breaks something

### Step 4 — Emit the handoff prompt

Generate a single self-contained prompt the user can paste into the cluster repo's Claude Code session. Template:

````markdown
## Cluster handoff — from 1Code enterprise fork

**Date**: YYYY-MM-DD
**Source repo**: `/Users/jason/dev/ai-stack/ai-coding-cli` @ commit `<short-sha>`
**Source change**: `<openspec-change-name>` (<N>/<total>)

### What's happening in the source repo

<One-paragraph description of the change and why it needs cluster-side matching work. Cite the specific proposal / design / spec lines if they inform the cluster-side architecture.>

### What the cluster repo needs to do

Artifacts to change (fill in per Step 3):

- [ ] `<path in cluster repo>` — <description>
- [ ] `<path in cluster repo>` — <description>

### Invariants (NON-NEGOTIABLE)

**Trust the edge.** All identity + auth happens at Envoy Gateway, not inside workloads. Use `SecurityPolicy` + JWT provider + `claimToHeaders` to inject `x-litellm-customer-id` from the Entra `oid` claim. Do NOT add JWT validation inside LiteLLM or inside `1code-api`.

**LiteLLM OSS only.** The cluster does NOT have a LiteLLM Enterprise license. Forbidden features: `enable_jwt_auth`, per-team/per-key guardrails, custom-tag budgets, secret-manager integration, GCS/Azure Blob exports, JWT-SSO admin UI. Use the OSS alternative in every case:

- JWT auth → Envoy `SecurityPolicy`
- Per-key guardrails → global guardrails + Envoy rate limits
- Secret-manager → Kubernetes Secret + SOPS
- Blob export → standard S3 export

**Flux v2 + GitOps.** Do NOT `kubectl apply` directly. All changes go through commits to the cluster repo; Flux reconciles. Use `${PLACEHOLDER}` substitution in manifest values per existing convention.

**Talos-specific.** No `ssh` into nodes, no kubelet sidecar, no privileged containers without `securityContext`. Talos API is the only out-of-band management plane.

### Required verification on cluster side

1. `flux reconcile source git <source-name>` to confirm the commit was picked up
2. `kubectl get <resource-type>` to confirm the resource reached `Ready`
3. Envoy test: `curl -H "Authorization: Bearer <entra-token>" https://<cluster-hostname>/<route>` returns the expected response with `x-litellm-customer-id` header visible in LiteLLM logs
4. For SecurityPolicy changes: verify the old route still works (no regression) + the new claim-to-header mapping shows up in Envoy access logs

### Post-cluster-side steps (back in source repo)

<blocking / non-blocking marker>

- Blocking: the source repo PR waits for the cluster commit hash to land, then updates its `docs/operations/cluster-access.md` to reference the new cluster commit
- Non-blocking: source repo PR merges independently; cluster-side work tracked in source repo's roadmap entry

### Rollback plan

<fill in from Step 3>

### Authoritative references

- Cluster repo: `/Users/jason/dev/ai-k8s/talos-ai-cluster/` @ commit `<cluster-short-sha>` (pinned at time of handoff)
- Auth strategy: `docs/enterprise/auth-strategy.md` §3.1 (cluster lock-down) + §4.9 (trust-the-edge) + §5.4 (x-litellm-customer-id header contract)
- LiteLLM OSS boundary: CLAUDE.md project-orchestrator Step 0 gate + auto-memory `project_litellm_feature_boundary.md`
- Cluster coordinates: `docs/operations/cluster-access.md`
- Deployment target docs: `deploy/README.md`
````

### Step 5 — Save or share the prompt

The generated prompt is meant to be pasted into the cluster repo's Claude Code session directly. Offer the user:

- Copy to clipboard (macOS: `pbcopy`)
- Write to `.scratchpad/cluster-handoff-<change-name>-<date>.md` for reference (gitignored)
- Paste inline for immediate review

Do NOT commit the handoff prompt to this repo — it's ephemeral. If the handoff is important enough to preserve, the cluster-side commit hash should be cited in `docs/operations/roadmap.md` "Recently Completed" once both sides land.

## Related

- `docs/operations/cluster-access.md` — authoritative cluster coordinates and access guide
- `docs/enterprise/auth-strategy.md` — cluster-side auth architecture (trust-the-edge)
- Auto-memory `project_cluster_facts.md` — session-persistent facts about Envoy/Entra/Talos versions
- Auto-memory `project_litellm_feature_boundary.md` — OSS vs Enterprise boundary
- `.claude/skills/project-orchestrator/SKILL.md` — Step 0 hard-rule gate (cluster concerns surface here first)
