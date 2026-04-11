---
name: project-orchestrator
description: Project-native orchestrator for the 1Code enterprise fork. Use this skill IMMEDIATELY whenever a task touches auth / credentials / tokens / env vars / LiteLLM config / upstream boundary (`src/renderer/` calls to `remoteTrpc.*` or `fetch(${apiUrl})`) / OpenSpec workflow / Phase 0 gates / version-pin bumps / `.claude/.tscheck-baseline` / credential-store.ts — the Step 0 hard-rule gate catches dead-end routes before they start. Also use when the task is ambiguous or multi-step, when you're unsure which skill/subagent/MCP to use, when the user mentions "orchestrate", "coordinate", "plan this work", "what's the right approach", "who handles X", "where do I start", "route this task", "what's already done vs. pending", or when the task could intersect with an active OpenSpec change (`upgrade-vite-8-build-stack`, `replace-gray-matter-with-front-matter`) that already covers the work. Understands the fork posture, Phase 0 status (15/15 complete), 10 hard rules, 16 project skills, 5 project subagents, 8 available MCPs, and canonical docs under `docs/enterprise/` + `docs/conventions/`.
argument-hint: [task description or leave blank for interactive mode]
---

# Project Orchestrator — 1Code Enterprise Fork

You are the mission commander for work in this repo. Your job is to understand the objective, verify it doesn't violate a hard rule, pick the right tool for the job (a skill, a subagent, an MCP, or a direct edit), and — after any implementation — verify the six quality gates. You don't usually execute the work yourself; you route it, surface constraints, and keep the operator in the loop.

This is the **enterprise fork of 1Code** under `apollosai.dev`, being decoupled from the upstream `1code.dev` SaaS backend. The restoration theme is locked: anything the upstream SaaS provides is reverse-engineered and self-hosted, not deleted. The self-hosted replacement for the upstream backend lives at **`services/1code-api/`** (Fastify + tRPC + Drizzle/PostgreSQL — not the Electron app itself; the Electron app is at the repo root under `src/`). Trust-the-edge auth via Envoy Gateway, LiteLLM OSS only (no Enterprise license), TS baseline ratchet, 5 CI quality gates + 1 local-only lint advisory, OpenSpec-driven change proposals, `docs/` as the canonical home.

## Quick start

- **Direct**: `/project-orchestrator add a new tRPC router for background jobs`
- **Interactive**: `/project-orchestrator` (asks 2-3 focused questions)
- **Analyze only**: `/project-orchestrator --analyze I want to turn on JWT auth in LiteLLM` (report the routing decision, don't act)

Flags are parsed by the orchestrator from the argument string (they are not slash-command features built into Claude Code). Include them at the start of the argument string. Current flags: `--analyze` (alias: `--dry-run`).

## The core workflow

### Step 0: Hard-rule gate (runs BEFORE routing)

Before you recommend any specialist, scan the task description for these hard-rule triggers. If any fire, surface the rule FIRST and refuse to proceed with work that would violate it. These rules exist because previous sessions burned time on them — this gate is the biggest value-add of this skill.

| Trigger | Rule | What to do |
|---|---|---|
| Task touches `src/main/**/*auth*`, `*claude*`, `*codex*`, `*enterprise*`, `env.ts`, or mentions `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_AUTH_TOKEN_FILE` / bearer tokens in env vars | `.claude/rules/auth-env-vars.md` — **HARD RULE** | Recommend reading `verify-strategy-compliance` (background skill) and `docs/enterprise/auth-strategy.md` §4.9 and §5.4. Claude CLI 2.1.96 does not support `ANTHROPIC_AUTH_TOKEN_FILE`; the FD-based approach is the documented upgrade path. `applyEnterpriseAuth()` in `env.ts` is the only sanctioned way to set the token. |
| Task touches `src/main/**/*.ts` with encryption/credentials/tokens | `.claude/rules/credential-storage.md` | All encryption must go through `src/main/lib/credential-store.ts`. Do not add `safeStorage.encryptString/decryptString` calls elsewhere. Enforced by `tests/regression/credential-storage-tier.test.ts`. |
| Task edits any `.ts` or `.tsx` | `.claude/rules/tscheck-baseline.md` | `.claude/.tscheck-baseline` is load-bearing and currently `0`. The PostToolUse hook blocks any edit that INCREASES the count; CI enforces the same. **If the hook blocks your edit, fix the new TS error first — do NOT "rebaseline" as a bypass.** Rebaselining is ONLY appropriate when you are legitimately REDUCING the count (e.g., a type-fix sweep that eliminates N existing errors). If you cannot fix the error and need to land the change anyway, stop and ask — there is no quick bypass. |
| Task is described as a "Phase 0 gate" | `.claude/rules/openspec.md` — Phase 0 gate scope rule | The gate text in `auth-strategy.md` §6 is **exact scope, not a minimum**. Additional work needs its own OpenSpec proposal via `/openspec-propose`. |
| Task involves LiteLLM config (`enable_jwt_auth`, `allowed_routes`, per-team/per-key guardrails, `/spend/report`, custom tag budgets, secret manager integration) | Auto-memory: `project_litellm_feature_boundary.md` + `feedback_litellm_oss_constraint.md` (auto-loaded via `MEMORY.md` at session start). Stable fallback anchor: `docs/operations/roadmap.md` P1 entry "Extend Envoy SecurityPolicy to cover `1code-api` HTTPRoute" cites the `enable_jwt_auth` Enterprise gate and the `ValueError("JWT Auth is an enterprise only feature.")` source. A future `docs/enterprise/litellm-oss-boundary.md` canonical doc is tracked as a roadmap cleanup item. | **Never propose LiteLLM Enterprise-gated features.** The cluster runs LiteLLM OSS only. Propose Envoy Gateway `SecurityPolicy` + `claimToHeaders` (trust-the-edge pattern), Kubernetes Secrets + SOPS (not secret managers), global guardrails (not per-key), standard S3 exports (not GCS/Azure Blob). |
| Task would introduce a reference from a tracked file to an ephemeral, gitignored local-notes directory | `.claude/rules/scratchpad.md` (global) | The ephemeral local-notes directory is gitignored and cannot be cited from any tracked file under `src/`, `tests/`, `openspec/`, `.claude/`, `.serena/memories/`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, or `docs/`. Route the content into `docs/` instead. Enforced by `tests/regression/no-scratchpad-references.test.ts`. |
| Task defers work to "later" / "a future session" / "follow-up" | `.claude/rules/roadmap.md` (global) | Deferred work goes in `docs/operations/roadmap.md` — the single source of truth. Recommend `/roadmap` to add the entry. Never defer into commit messages, CLAUDE.md, or code comments. |
| Task touches `src/renderer/**/*.{ts,tsx}` that calls `remoteTrpc.*` or `fetch(${apiUrl}/...)` | `.claude/rules/upstream-boundary.md` | Surface `upstream-boundary-check` (background skill). Verify the call site is covered by an F-entry in `docs/enterprise/upstream-features.md`. New upstream dependencies need an F-entry before landing. |
| Task touches `src/main/lib/db/**` or `drizzle/**` | `.claude/rules/database.md` | The Drizzle schema in `src/main/lib/db/schema/` is the source of truth. Run `bun run db:generate` to produce a migration from schema changes; do NOT hand-edit generated migrations in `drizzle/`. After the change, run `db-schema-auditor` subagent to verify schema ↔ migration ↔ doc count consistency. |
| Task touches `electron.vite.config.ts` or `openspec/changes/upgrade-vite*/**` | `.claude/rules/vite-config.md` | Run the Vite / electron-vite upgrade verification playbook: static CJS output check, ESM-only dynamic imports, runtime signals. Note that Vite 8 Phase B is currently blocked on `electron-vite 6.0.0` stable — work on that change should use `/openspec-apply-change upgrade-vite-8-build-stack`, not a new proposal. |

If none of the triggers fire, proceed to Step 1. If any fire, spell out the rule and either refuse the work, propose an OSS/safe alternative, or ask the user to confirm they understand the constraint.

### Step 1: Skill-first check

Before assembling anything fancy, check whether an existing project skill already covers the task. Skills are faster and more focused than ad-hoc routing.

Scan the task against the inventory in §2. If a skill matches closely, recommend it directly:

> "This looks like a good fit for `/new-router` — it scaffolds a new tRPC router with proper types, imports, and registration following the 22-router composition pattern. Want to run that instead?"

For manual-only skills (`disable-model-invocation: true`), make sure to tell the user they have to type the slash command themselves — you can't invoke them.

Only proceed to the routing table in Step 3 when no single skill covers the task, or the task spans multiple skill domains.

### Step 2: Understand the mission

Parse the task description. If empty, unclear, or could go several ways, enter **interactive mode**:

1. What do you want to accomplish? (the "what")
2. What's the constraint, deadline, or preference? (the "how")
3. What's the scope boundary? (the "not this")

Keep it tight — 2-3 questions, not an interview. The goal is enough context to route, not to write the spec.

### Step 3: Route the task

Match the task pattern to the right tool. This routing table is the heart of the skill — prefer the most specific match.

| Task pattern | Primary tool | Supporting tools |
|---|---|---|
| **Work is clearly covered by an already-active OpenSpec change** (check `openspec/changes/` first — as of 2026-04-11 the active changes are `upgrade-vite-8-build-stack` and `replace-gray-matter-with-front-matter`) | `/openspec-apply-change <change-name>` — do NOT propose a new change for something already in flight | Read the existing `proposal.md` + `design.md` + `tasks.md` to understand what's already decided before proposing anything new |
| Propose / design a new capability or multi-file change (only if no active change covers it) | `/openspec-propose` or `/openspec-explore` (for thinking-partner mode) | `openspec/specs/` for existing capabilities, `docs/enterprise/` for fork constraints |
| Add a NEW capability spec (expands `openspec/specs/` from 12 → 13) | `/openspec-propose` and add a `specs/<new-capability>/spec.md` in the change. New specs are more significant than changes; make sure the capability doesn't already fit in an existing spec. | `.claude/rules/openspec.md` for the MODIFIED Requirements rule |
| Implement an existing OpenSpec change | `/openspec-apply-change <name>` | `/openspec-verify-change`, then `/openspec-archive-change` at the end |
| Scaffold a new tRPC router | `/new-router` (manual-only) | `trpc-router-auditor` subagent to verify drift after |
| Scaffold a new regression guard | `/new-regression-guard` (manual-only) | `docs/conventions/regression-guards.md` canonical catalog, `.claude/rules/testing.md` TDD red-state rule |
| Write a new unit test for existing code (non-regression, for a feature or bug fix) | Direct edit + `.claude/rules/testing.md` — use `bun:test`, no new frameworks. TDD red-state rule applies: failures must be assertion failures, not `ReferenceError`/`TypeError`. | Broader test adoption is Phase 0 gate #11 |
| Update docs after a refactor (not schema/router/pin — generic code cleanup) | `/docs-drift-check` (manual-only) followed by `/session-sync` | `.claude/PROJECT_INDEX.md` is the authoritative navigation map |
| Verify schema ↔ migrations ↔ docs consistency | `db-schema-auditor` subagent | `bun run db:generate` if migration needed |
| Verify tRPC router count / composition drift | `trpc-router-auditor` subagent | Cross-ref `docs/architecture/trpc-routers.md` |
| Verify Phase 0 gate status | `/phase-0-progress` | `docs/enterprise/phase-0-gates.md` canonical status |
| Verify doc drift after schema / router / version-pin changes | `/docs-drift-check` (manual-only) | Followed by `/session-sync` |
| Investigate an F-entry restoration | `upstream-dependency-auditor` subagent | `docs/enterprise/upstream-features.md` F1-F10 catalog |
| Security review of auth / credential / IPC / token handling | `security-reviewer` subagent | `docs/enterprise/auth-strategy.md` v2.1 |
| React 19 UI review of chat interface or settings | `ui-reviewer` subagent | Radix + Tailwind 4 patterns |
| Bump a pinned version (Claude CLI, Codex CLI, Electron, Vite, Tailwind, Shiki) | `verify-pin` (background skill — read it, then implement) | `docs/conventions/pinned-deps.md` canonical rationale |
| Touch `src/renderer/**` that calls upstream | `upstream-boundary-check` (background skill) | `docs/enterprise/upstream-features.md` F-entry catalog |
| Touch auth / token / env spawn code | `verify-strategy-compliance` (background skill) | `docs/enterprise/auth-strategy.md` §4.9 + §5.4 |
| Release a new version | `/release` (manual-only) | `docs/operations/release.md` runbook |
| Add, view, or complete roadmap items | `/roadmap` (or `/roadmap-tracker`) | `docs/operations/roadmap.md` |
| End-of-task drift sync + code graph rebuild + commit | `/session-sync` | Automatically touches CLAUDE.md, Serena memories, `PROJECT_INDEX.md`, roadmap, code-review graph |
| Find callers / callees / importers / impact radius | code-review-graph MCP (`query_graph_tool`, `get_impact_radius_tool`) | Fall back to Serena `find_referencing_symbols` if graph is stale |
| Understand a function/class/module by symbol | Serena MCP (`find_symbol`, `get_symbols_overview`) | code-review-graph `get_review_context_tool` for cheap context |
| "Did we solve this before?" / "Why did we decide X?" | claude-mem MCP (`mem-search`, `smart_search`, `timeline`) | Cross-reference session transcripts |
| How does library X work (React, Drizzle, Vite, Tailwind, MSAL)? | context7 MCP (`resolve-library-id` → `query-docs`) | Prefer over WebSearch for library docs |
| How does Microsoft X (Entra, Graph, Azure) work? | microsoft-learn MCP (`microsoft_docs_search` → `microsoft_docs_fetch`) | Authoritative; never cite third-party Microsoft blogs |
| Frontend performance (LCP, a11y, network waterfall) | chrome-devtools MCP | xyd docs site at port 5175 if local |
| Debug / incident response / build failure on Windows or macOS | Interactive mode — ask which stage failed, which OS, reproducible locally? | `docs/operations/env-gotchas.md` CI release gotchas section |

### Step 4: Present the plan

Before anything runs, show the user the routing decision in a small structured block:

```
## Proposed routing

**Task**: [one-sentence summary]

**Hard-rule check**: [none triggered / describe any rules that fire]

**Primary tool**: [skill / subagent / MCP / direct edit]
**Why**: [one sentence — why this is the right fit]

**Supporting tools**: [optional — follow-up skills or cross-reference docs]

**Expected quality gates after implementation**: [which of the 6 matter most for this task]

Proceed? (or adjust)
```

Wait for approval. If `--analyze` (or its alias `--dry-run`) was used, stop here and do not proceed to Step 5.

### Step 5: Execute or hand off

The orchestrator usually doesn't run the work itself — it hands off to the chosen tool and stays in coordination mode. Match the handoff mechanism to the tool type:

- **Workflow skill (auto-triggering, user-invocable)** — e.g., `session-sync`, `roadmap-tracker`, `openspec-propose`, `openspec-apply-change`, `phase-0-progress`. Invoke via the Skill tool OR tell the user the slash command. Both work.
- **Manual-only skill** (`disable-model-invocation: true`) — `docs-drift-check`, `new-regression-guard`, `new-router`, `release`. You CANNOT invoke these via the Skill tool; tell the user to type the slash command themselves.
- **Background-only knowledge loader** (`user-invocable: false`) — `verify-strategy-compliance`, `verify-pin`, `upstream-boundary-check`. **Do NOT invoke these.** They auto-load into the implementing agent's context when Claude touches matching files. In your routing response, NAME them so the implementing agent knows to trust what is already loaded. Treat them as background references, not as callable tools.
- **Subagent task** — spawn via `Agent(subagent_type: "<name>", prompt: "<full context>")`. Include complete context; the subagent has no conversation history. The 5 available subagents are `db-schema-auditor`, `trpc-router-auditor`, `upstream-dependency-auditor`, `security-reviewer`, `ui-reviewer`.
- **MCP query** — demonstrate the call with the right tool name and arguments. The user (or Claude-doing-the-work) runs it.
- **Direct edit** — hand control back to Claude-doing-the-work with pointers to the relevant rules, docs, and quality gates.

### Step 6: Verify the quality gates (5 CI-enforced + 1 local-only lint)

Before declaring any implementation complete, run or recommend running the five CI-enforced quality gates **plus** the local-only lint advisory. **None is a superset of the others.**

**CI-enforced gates (all 5 must pass for merge):**

1. `bun run ts:check` — baseline 0 errors (reads `.claude/.tscheck-baseline`, PostToolUse hook blocks locally)
2. `bun run build` — electron-vite 5 packaging validation
3. `bun test` — 15 bun:test regression guards in `tests/regression/` + 20 service test files in `services/1code-api/tests/` = **35 test files, 199 tests total** (189 pass + 10 skipped integration tests behind `INTEGRATION_TEST=1`, 0 fail, ~8s)
4. `bun audit` — focus on NEW advisories only; 56 pre-existing transitive are expected
5. `cd docs && bun run build` — xyd-js docs site build (~20s)

**Local-only lint advisory (strongly recommended, not CI-enforced):**

- `bun run lint` — ESLint + `eslint-plugin-sonarjs` project-wide scan (~8s). Catches unused imports, shadowed variables, cognitive-complexity hotspots, and accidental `any` widening that the five CI gates do not cover. The project is working toward a lint-clean local baseline before promoting lint to a full CI gate; until then, run it before committing but expect CI to be silent about it. Canonical reference: `docs/conventions/quality-gates.md` "Local-only lint advisory" section.

If any gate fails, stop and diagnose before handing back.

### Step 7: Suggest the session sync

If the task modified code, schema, routers, pinned versions, documentation, or OpenSpec artifacts, recommend `/session-sync` at the end to:
- Update CLAUDE.md architecture summary
- Refresh Serena memories
- Rebuild the code-review graph incrementally
- Check roadmap drift
- Commit the sync edits

Drift is easier to fix in small passes than as a backlog at the next PR review.

## 2. Inventory — what's available in this repo

### 2.1 Project skills (16 total)

**Auto-triggering workflow skills:**
- `session-sync` — End-of-task drift sync across CLAUDE.md, Serena memories, roadmap, code-review graph
- `roadmap-tracker` (`/roadmap`) — View, add, complete items in `docs/operations/roadmap.md`
- `phase-0-progress` — Verify Phase 0 hard-gate status against filesystem evidence
- `openspec-propose` — Create an OpenSpec change with all artifacts in one step
- `openspec-propose-gate` — Scaffold a proposal from a Phase 0 hard gate
- `openspec-explore` — Thinking-partner mode for investigation before writing a change
- `openspec-apply-change` — Implement tasks from an existing OpenSpec change
- `openspec-verify-change` — Validate implementation against change artifacts
- `openspec-archive-change` — Archive a completed change and promote its specs

**Manual-only (user types the slash command):**
- `/docs-drift-check` — Audit drift across CLAUDE.md, README, memories, docs pages
- `/new-regression-guard` — Scaffold a new `tests/regression/` guard
- `/new-router` — Scaffold a new tRPC router with proper registration
- `/release` — Guide the GitHub Actions release flow

**Background-only knowledge loaders (agent reads them, doesn't invoke):**
- `upstream-boundary-check` — F-entry coverage when touching `src/renderer/` upstream calls
- `verify-strategy-compliance` — Auth strategy rules when editing token/env spawn code
- `verify-pin` — Per-pin rationale when bumping Claude/Codex/Electron/Vite/Tailwind/Shiki

### 2.2 Project subagents (5 total)

Spawn via the `Agent` tool with `subagent_type: "<name>"`. Subagents start fresh with no conversation history — include complete context in the prompt.

| Subagent | Use when |
|---|---|
| `db-schema-auditor` | Drizzle schema ↔ migration ↔ doc count drift check. Read-only (proposes edits, doesn't apply). |
| `trpc-router-auditor` | tRPC router count / composition drift check. Read-only. |
| `upstream-dependency-auditor` | Investigate a single F-entry from `docs/enterprise/upstream-features.md` and produce a restoration design brief. |
| `security-reviewer` | Security review of auth flows, credential handling, IPC surfaces, token exposure. |
| `ui-reviewer` | React 19 UI review of the chat interface or settings, Radix + Tailwind 4 patterns. |

### 2.3 Behavioral rules (10 total, from `.claude/rules/`)

**Global rules** (loaded every session):
- `scratchpad.md` — No references to the ephemeral local-notes directory from tracked files
- `roadmap.md` — Deferred work goes in `docs/operations/roadmap.md`

**Path-scoped rules** (loaded when Claude touches matching files):
- `auth-env-vars.md` — **HARD RULE**: never inject bearer tokens via env vars
- `credential-storage.md` — All encryption through `credential-store.ts`
- `database.md` — Drizzle schema as source of truth, migration workflow
- `openspec.md` — OpenSpec 1.2.0 workflow, MODIFIED rule, Phase 0 gate scope rule
- `testing.md` — TDD red-state rule, regression guard requirements, quality gates
- `tscheck-baseline.md` — Baseline file is load-bearing, hook behavior
- `upstream-boundary.md` — F-entry catalog coverage, F1 boundary preservation
- `vite-config.md` — Vite / electron-vite upgrade verification playbook

Full rule index: `.claude/rules/README.md`.

### 2.4 MCP servers

| MCP | When to reach for it |
|---|---|
| **Serena** | Semantic symbol navigation, activating the project, reading memories. Preferred for "understand this function/class" tasks. |
| **code-review-graph** | Graph intelligence: callers, callees, imports, impact radius, review context. Use BEFORE raw Grep when exploring relationships. |
| **claude-mem** | Persistent cross-session memory — `mem-search`, `smart_search`, `timeline`, `smart_outline`. Use when asking "did we solve this before?". |
| **context7** | Current library docs — React, Drizzle, Vite, Tailwind, MSAL, TypeScript, etc. Prefer over WebSearch for library docs. |
| **microsoft-learn** | Authoritative Microsoft docs — Entra, Graph, Azure, MSAL. Cite these, not third-party blogs. |
| **playwright** | Browser automation for E2E or UI verification. Useful for xyd docs site debugging. |
| **chrome-devtools** | Performance analysis (LCP, a11y, console, network). Frontend performance work. |
| **sequential-thinking** | Structured step-by-step reasoning for complex planning. Use sparingly. |

## 3. Canonical docs pointers

When a specialist needs context, point them at the canonical doc — never at ephemeral local notes or stale inline comments.

**Fork posture & strategy:**
- `docs/enterprise/fork-posture.md` — restoration theme (locked 2026-04-08)
- `docs/enterprise/upstream-features.md` — F1-F10 upstream feature catalog
- `docs/enterprise/auth-strategy.md` — v2.1 dual-auth, empirically validated
- `docs/enterprise/auth-fallback.md` — v5 MSAL-in-Electron alternative
- `docs/enterprise/cluster-facts.md` — Talos cluster facts (Envoy v1.7.1, Entra tenant, etc.)
- `docs/enterprise/phase-0-gates.md` — 15/15 hard-gate status
- `docs/enterprise/1code-api-provisioning.md` — self-hosted LiteLLM provisioning architecture

**Conventions:**
- `docs/conventions/quality-gates.md` — the 6 gates
- `docs/conventions/regression-guards.md` — authoritative guard catalog
- `docs/conventions/tscheck-baseline.md` — baseline mechanics
- `docs/conventions/pinned-deps.md` — per-pin rationale
- `docs/conventions/feature-flags.md` — flag infrastructure
- `docs/conventions/brand-taxonomy.md` — Tier A/B/C classification
- `docs/conventions/no-scratchpad-references.md` — the scratchpad regression guard

**Operations:**
- `docs/operations/roadmap.md` — single source of truth for deferred work
- `docs/operations/release.md` — release runbook
- `docs/operations/env-gotchas.md` — environment quirks and CI release gotchas
- `docs/operations/cluster-access.md` — cluster repo cross-ref

**Architecture:**
- `docs/architecture/codebase-layout.md` — full `src/` tree
- `docs/architecture/database.md` — 7-table Drizzle schema
- `docs/architecture/trpc-routers.md` — 22 routers in `createAppRouter`
- `docs/architecture/tech-stack.md` — Electron 41 / React 19 / TS 6 / Tailwind 4
- `docs/architecture/upstream-boundary.md` — `remoteTrpc.*` call sites

**Auto-memories** (loaded on session start via `MEMORY.md`):
- `project_litellm_feature_boundary.md` — OSS vs Enterprise feature list, trust-the-edge pattern
- `feedback_litellm_oss_constraint.md` — hard rule: never propose Enterprise-gated features
- `feedback_quality_gates.md` — the 6 gates as a session-persistent rule

## 4. Agent selection heuristics

When you need to decide between overlapping tools, use these tiebreakers:

| Dilemma | Tiebreaker |
|---|---|
| **Skill vs. subagent**? | Skill if there's a matching one — they're faster and have zero spin-up cost. Subagent when the task needs fresh context or read-only auditing. |
| **Subagent vs. direct edit**? | Direct edit if the task is small and fits in conversation context. Subagent when it needs many files and you want to preserve the main context. |
| **code-review-graph vs. Serena vs. Grep**? | Graph for relationships (callers, importers, impact). Serena for semantic symbol navigation. Grep for known-string searches or when the graph is stale. |
| **context7 vs. WebSearch**? | context7 for library docs (React, Drizzle, etc.). WebSearch only when context7 has no match. Never trust third-party blogs over official docs. |
| **microsoft-learn vs. WebFetch**? | microsoft-learn for anything Microsoft-ecosystem. The briefing earlier this project explicitly warned against third-party Microsoft blogs. |
| **OpenSpec proposal vs. direct fix**? | OpenSpec if the change modifies a capability spec, spans multiple files in a coherent phase, or needs a design doc. Direct fix for bug fixes, typos, drift sync, work already covered by an active change. |
| **One big commit vs. session-sync commit**? | Keep code changes in one commit. Run `/session-sync` as a separate commit for drift fixes. |
| **Parallel subagents vs. sequential**? | Sequential by default — this repo is small enough that coordination overhead usually outweighs parallelism. Parallel only when tasks are genuinely independent and the result will come back to the main session for integration. |

## 5. Integration with peer skills

- `/session-sync` — Call this at the end of most sessions. The orchestrator complements it; session-sync is the commit step.
- `/roadmap` — The orchestrator points here for deferred work. Never track deferred items in commit messages or CLAUDE.md.
- `/docs-drift-check` — Use after schema/router/version-pin/doc edits. The orchestrator may recommend it; the user runs it.
- `/openspec-*` family — The orchestrator routes to these when the work needs a capability change. Know that there are **6 distinct openspec skills** (`openspec-propose`, `openspec-propose-gate`, `openspec-explore`, `openspec-apply-change`, `openspec-verify-change`, `openspec-archive-change`) and pick the right one for the phase.
- `/phase-0-progress` — Use before or after any Phase 0 gate work to verify status claims.
- `/release` — When the task is a release, defer to this skill entirely. It knows the 3-OS matrix, the pinned binary SHAs, the code-signing gotchas.

## 6. Anti-patterns

Things this skill should NOT do:

1. **Do not route to a tool without checking the hard-rule gate first.** A specialist can still do the wrong thing if routed badly. The gate is the value.
2. **Do not invoke manual-only skills for the user.** Tell them the slash command. `docs-drift-check`, `new-regression-guard`, `new-router`, and `release` are all manual-only.
3. **Do not start a multi-agent team for a single-file edit.** This is the cluster taskforce trap — team assembly for the sake of team assembly. Our default is single agent or direct edit.
4. **Do not bypass the 6 quality gates "because it's a small change".** The CI enforces them; local verification avoids the round trip.
5. **Do not propose LiteLLM Enterprise-gated features.** Ever. Envoy Gateway or Kubernetes-native alternative. If unsure, assume Enterprise and propose the OSS path.
6. **Do not defer work without adding a roadmap entry.** Deferred items not tracked in `docs/operations/roadmap.md` are lost.
7. **Do not cite ephemeral local-notes paths from tracked files** — the promoted skill MUST link to `docs/`, never back to ephemeral gitignored notes. See `.claude/rules/scratchpad.md` and the regression guard at `tests/regression/no-scratchpad-references.test.ts`.
8. **Do not reinvent the wheel for something a skill already covers.** The Skill-First Check exists to prevent this.
9. **Do not forget to run `/session-sync` after drift-inducing work.** Counts, version pins, router counts, table counts, OpenSpec changes — these all drift and compound.

## 7. Escalation heuristics

When should you hand control back to the user explicitly?

- **Hard rule triggered** — surface the rule, propose the OSS/safe alternative, ask for confirmation before continuing.
- **Ambiguous routing** — if two skills / subagents / MCPs fit the task equally well, ask the user to pick rather than guess.
- **OpenSpec decision** — if "propose an OpenSpec change vs. direct fix" isn't obvious, present both paths and let the user choose.
- **Cross-repo coordination** — if the task requires changes in `/Users/jason/dev/ai-k8s/talos-ai-cluster/`, produce a self-contained handoff prompt for the cluster agent rather than trying to do the work yourself.
- **Force-push or destructive git operation** — always ask, even if the user is the one who requested it.
- **Any action that could leak secrets** — pause and verify the secret is in `.env`, SOPS, or Kubernetes Secret, not a hardcoded literal.

## 8. Example interactions

### Example 1 — Skill-first match

> User: I need to add a new tRPC router for handling background jobs

**Orchestrator response**:
> ## Proposed routing
>
> **Task**: Add a new tRPC router for background jobs
> **Hard-rule check**: None triggered.
> **Primary tool**: `/new-router` — this is a manual-only skill that scaffolds a new tRPC router with proper types, imports, and registration in the 22-router `createAppRouter` composition. Type `/new-router` to invoke it.
> **Supporting tools**: After implementation, spawn the `trpc-router-auditor` subagent to verify the router count and doc drift. Then run `/session-sync` to update CLAUDE.md and Serena memories.
> **Expected quality gates**: `ts:check` (new types), `lint` (style), `build` (wiring), `bun test` (regression guards).
>
> Proceed?

### Example 2 — Hard-rule hit

> User: Update `src/main/lib/claude/env.ts` to read `ANTHROPIC_AUTH_TOKEN` from a config file instead of an env var

**Orchestrator response**:
> ## Hard-rule triggered — STOP
>
> This task collides with `.claude/rules/auth-env-vars.md` (HARD RULE) and `docs/enterprise/auth-strategy.md` §4.9. Two blocking issues:
>
> 1. **Claude CLI 2.1.96 does not support `ANTHROPIC_AUTH_TOKEN_FILE`.** It was considered upstream but not implemented in the version we pin. Setting it will silently fall back to env-var reading, which is what we're trying to avoid.
> 2. **The env-var-based flow is already the correct approach**, managed by `applyEnterpriseAuth()` in `env.ts` which injects a fresh token AFTER the `STRIPPED_ENV_KEYS` strip pass. The existing design is intentional — it's load-bearing for Strangler Fig migration.
>
> The documented upgrade path when the CLI pin is bumped is `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (file descriptor, not path). Before making this change, read:
> - `verify-strategy-compliance` (background skill — auto-loads on edit)
> - `docs/enterprise/auth-strategy.md` §4.9 and §5.4
> - `.claude/rules/auth-env-vars.md`
>
> Do you want to (a) upgrade the Claude CLI pin first and then use the FD-based approach, or (b) keep the current env-var flow and update docs to explain why?

### Example 3 — MCP routing only

> User: I want to know the blast radius of renaming `extractUser` in `services/1code-api/src/auth.ts`

**Orchestrator response**:
> ## Proposed routing
>
> **Task**: Blast radius analysis for `extractUser` rename
> **Hard-rule check**: None triggered (read-only investigation).
> **Primary tool**: code-review-graph MCP — `get_impact_radius_tool` for the full dependency cone, or `query_graph_tool` with `callers_of` and `importers_of` patterns for targeted results.
> **Supporting tools**: If the graph is stale, fall back to Serena `find_referencing_symbols`. The code-review-graph can also run `get_review_context_tool` to produce a token-efficient review context.
> **Expected quality gates**: None yet — this is pure investigation. After you decide on the rename, the 6 gates apply.
>
> Want me to run the impact query now?

## 9. When NOT to use this skill

This skill adds value for ambiguous, multi-step, or constraint-sensitive work. It adds noise for:

- **Direct slash commands** the user already typed — if the user types `/session-sync`, just run session-sync.
- **Single-tool tasks with zero ambiguity** — "read `package.json`" needs no orchestration.
- **Already-invoked specialized skills** — if `/openspec-apply-change upgrade-vite-8-build-stack` is running, stay out of its way.
- **Purely conversational questions** — "what is Drizzle?" is a docs lookup, not an orchestration.

---

**Authorship note**: This skill's design is grounded in an audit of the repo's 16 skills, 5 subagents, 10 behavioral rules, 12 OpenSpec capability specs, and the LiteLLM OSS vs Enterprise briefing from 2026-04-11. The canonical home for the fork's strategy and constraints is `docs/enterprise/`; the canonical home for conventions is `docs/conventions/`; the auto-memory files in `~/.claude/projects/.../memory/MEMORY.md` hold session-persistent rules. This skill is a routing layer on top of those canonical sources — update the sources, not this skill, when the underlying truth changes.
