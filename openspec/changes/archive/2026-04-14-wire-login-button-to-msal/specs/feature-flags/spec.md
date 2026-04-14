## ADDED Requirements

### Requirement: Dev-only environment-variable override for feature flags

The system SHALL consult `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` from `src/main/lib/feature-flags.ts:getFlag("enterpriseAuthEnabled")` BEFORE consulting the `feature_flag_overrides` database table, and BEFORE returning the default from `FLAG_DEFAULTS`. The override SHALL be active only when `app.isPackaged === false` (unpackaged dev builds). In packaged builds, the env-var override SHALL be ignored entirely.

When the env override is read, the value `"true"` SHALL resolve to boolean `true`, and the value `"false"` SHALL resolve to boolean `false`. Any other value (including unset) SHALL cause the resolver to fall through to the database / default lookup as if the env var were unset.

The override mechanism SHALL be hardcoded for the `enterpriseAuthEnabled` flag in this change; generalization to other flags SHALL be considered only if a second flag adopts the same pattern.

The implementation SHALL structure the resolver such that the `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` read is statically located inside an `if (!app.isPackaged) { ... }` conditional gate. This is verified by the regression guard via regex-scoped extraction of the gate body. A future refactor that moves the read outside the gate is therefore detected automatically.

The precedence order for `getFlag("enterpriseAuthEnabled")` is:
1. `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` (only when `!app.isPackaged`)
2. `feature_flag_overrides` row for the key (always consulted in both modes)
3. `FLAG_DEFAULTS["enterpriseAuthEnabled"]` (compile-time default `false`)

#### Scenario: Env override flips flag in dev

- **WHEN** `app.isPackaged === false`
- **AND** `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED === "true"`
- **AND** there is no `feature_flag_overrides` row for `enterpriseAuthEnabled`
- **THEN** `getFlag("enterpriseAuthEnabled")` returns `true`
- **AND** the database is not queried for this key

#### Scenario: Env override behaviorally not consulted in packaged build

- **WHEN** `app.isPackaged === true`
- **AND** `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED === "true"`
- **AND** there is no `feature_flag_overrides` row for `enterpriseAuthEnabled`
- **THEN** `getFlag("enterpriseAuthEnabled")` returns the default `false`
- **AND** the env var SHALL NOT be read at all (verified by regex-scoped guard that the read appears inside the `!app.isPackaged` conditional)

#### Scenario: Database override still wins over default in dev

- **WHEN** `app.isPackaged === false`
- **AND** `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` is unset
- **AND** a `feature_flag_overrides` row exists with `key = "enterpriseAuthEnabled"`, `value = "true"`
- **THEN** `getFlag("enterpriseAuthEnabled")` returns `true` from the database row

#### Scenario: Env override wins over database in dev

- **WHEN** `app.isPackaged === false`
- **AND** `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED === "false"`
- **AND** a `feature_flag_overrides` row exists with `key = "enterpriseAuthEnabled"`, `value = "true"`
- **THEN** `getFlag("enterpriseAuthEnabled")` returns `false` from the env var

#### Scenario: Invalid env value falls through

- **WHEN** `app.isPackaged === false`
- **AND** `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED === "yes"` (not `"true"` or `"false"`)
- **THEN** the resolver SHALL ignore the env var and fall through to the database / default lookup

#### Scenario: Other flags unaffected by env override

- **WHEN** `app.isPackaged === false`
- **AND** `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED === "true"`
- **AND** application code calls `getFlag("voiceViaLiteLLM")`
- **THEN** the env var SHALL NOT be consulted for `voiceViaLiteLLM`
- **AND** the resolver SHALL use the existing database / default lookup unchanged
- **AND** the regression guard asserts that `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` literal appears at most once in `feature-flags.ts` (scoped to the `enterpriseAuthEnabled` branch)
