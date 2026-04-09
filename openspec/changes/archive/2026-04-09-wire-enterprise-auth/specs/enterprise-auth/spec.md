## MODIFIED Requirements

### Requirement: Regression guard for module isolation and exports

A regression test at `tests/regression/enterprise-auth-module.test.ts` SHALL verify:

1. `enterprise-auth.ts` exists and exports `createEnterpriseAuth`
2. `enterprise-store.ts` exists and exports the cache plugin factory
3. `enterprise-types.ts` exists and exports `EnterpriseAuthConfig`, `EnterpriseUser`, `EnterpriseAuthResult`
4. ~~`auth-manager.ts` does NOT import from `enterprise-auth` (isolation boundary)~~ **REMOVED** — wiring is now permitted per change #2
5. `package.json` includes `@azure/msal-node`, `@azure/msal-node-extensions`, and `jose`

#### Scenario: Regression guard passes on compliant codebase

- **WHEN** `bun test tests/regression/enterprise-auth-module.test.ts` runs
- **THEN** all assertions pass

#### Scenario: Wiring is validated by the new enterprise-auth-wiring guard

- **WHEN** `bun test tests/regression/enterprise-auth-wiring.test.ts` runs
- **THEN** all wiring assertions pass (replaces the former isolation guard removed in change #2)
