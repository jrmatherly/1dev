## ADDED Requirements

### Requirement: Server-side plan resolution from feature flags
The system SHALL provide a server-side function `resolveUserPlan(userId: string): { email: string, plan: string, status: string }` in the `1code-api` service that maps the user's feature flag state to a subscription plan identifier. In enterprise mode, all authenticated users SHALL receive `plan: "onecode_max"` with `status: "active"`. The plan identifiers SHALL match the upstream SaaS values expected by the desktop app (`onecode_pro`, `onecode_max_100`, `onecode_max`).

#### Scenario: Enterprise user plan resolution
- **WHEN** the `1code-api` service receives `GET /api/desktop/user/plan` from an authenticated enterprise user
- **THEN** the service returns `{ "email": "<from-gateway-header>", "plan": "onecode_max", "status": "active" }` without consulting any external billing system

#### Scenario: Plan identifier matches desktop app expectations
- **WHEN** the desktop app's `auth-manager.ts:434` fetches `GET /api/desktop/user/plan`
- **THEN** the `plan` field contains one of: `onecode_pro`, `onecode_max_100`, `onecode_max`
- **AND** the `voice.ts:90-115` subscription check passes for enterprise users (gated on `onecode_pro` or higher)
