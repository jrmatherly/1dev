---
title: Fork Posture
icon: git-branch
---

# Fork Posture {subtitle="What this fork is and why it exists"}

**1Code** (by apollosai.dev) is an enterprise fork of the upstream [1Code by 21st-dev](https://github.com/21st-dev/1code). It is being progressively decoupled from the upstream `1code.dev` hosted backend in favor of self-hosted infrastructure.

## Self-Host-Everything Theme

**Locked 2026-04-08.** Anything the upstream SaaS was providing will be reverse-engineered, re-created, and self-hosted. The fork controls every runtime endpoint the shipped app talks to.

- "Drop the feature" is off the table (unless the feature is architecturally dead code)
- "Use someone else's hosted service" is off the table
- The end-state is a self-contained enterprise deployment

## Target Infrastructure

| Component | Technology |
|-----------|-----------|
| AI model gateway | LiteLLM (OSS edition, 5-user SSO cap) |
| Identity provider | Microsoft Entra ID |
| API gateway + auth | Envoy Gateway (dual-auth pattern) |
| Cluster | Talos Kubernetes (Flux/GitOps managed) |
| Update CDN | Self-hosted R2/S3 at `cdn.apollosai.dev` |

## What's Upstream-Dependent

See the [Upstream Features Catalog (F1-F10)](./upstream-features.md) for the per-feature breakdown of what depends on the upstream backend, what breaks when it's retired, and the restoration strategy for each.

## Phase 0

The immediate migration work is tracked as 15 "hard gates" that must close before the fork can ship standalone. See [Phase 0 Hard Gates](./phase-0-gates.md).

## Auth Strategy

The chosen enterprise auth path is documented in [Enterprise Auth Strategy (Envoy Gateway)](./auth-strategy.md). The MSAL-in-Electron fallback is at [Auth Fallback](./auth-fallback.md).
