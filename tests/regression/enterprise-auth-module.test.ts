/**
 * Regression guard: Enterprise auth module exports and isolation
 *
 * Ensures enterprise-auth.ts, enterprise-store.ts, and enterprise-types.ts
 * exist with correct exports, and that the module is NOT wired into
 * auth-manager.ts (isolation boundary per auth-strategy §5.3.1 Step A).
 *
 * This guard is intentionally REMOVED in change #2 (wire-enterprise-auth)
 * when the modules are wired into the auth flow.
 *
 * Part of the add-enterprise-auth-module OpenSpec change.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import path from "path";

const SRC_MAIN = path.join(import.meta.dir, "../../src/main");
const ENTERPRISE_AUTH = path.join(SRC_MAIN, "lib/enterprise-auth.ts");
const ENTERPRISE_STORE = path.join(SRC_MAIN, "lib/enterprise-store.ts");
const ENTERPRISE_TYPES = path.join(SRC_MAIN, "lib/enterprise-types.ts");
const AUTH_MANAGER = path.join(SRC_MAIN, "auth-manager.ts");
const PACKAGE_JSON = path.join(import.meta.dir, "../../package.json");

describe("enterprise-auth-module", () => {
  test("enterprise-auth.ts exists and exports createEnterpriseAuth", () => {
    expect(existsSync(ENTERPRISE_AUTH)).toBe(true);
    const content = readFileSync(ENTERPRISE_AUTH, "utf-8");
    expect(content).toContain("export async function createEnterpriseAuth");
    expect(content).toContain("export class EnterpriseAuth");
  });

  test("enterprise-auth.ts does NOT enable CP1 (CAE not useful for non-Microsoft resources)", () => {
    const content = readFileSync(ENTERPRISE_AUTH, "utf-8");
    // CP1 was removed after agent team review — LiteLLM is not CAE-enabled,
    // so CP1 would cause 28-hour tokens without revocation capability.
    expect(content).not.toContain('clientCapabilities: ["CP1"]');
    expect(content).toContain("CP1"); // Comment explaining the decision must remain
  });

  test("enterprise-store.ts exists and exports createEnterpriseCachePlugin", () => {
    expect(existsSync(ENTERPRISE_STORE)).toBe(true);
    const content = readFileSync(ENTERPRISE_STORE, "utf-8");
    expect(content).toContain(
      "export async function createEnterpriseCachePlugin",
    );
  });

  test("enterprise-store.ts integrates with credential-store.ts tier detection", () => {
    const content = readFileSync(ENTERPRISE_STORE, "utf-8");
    expect(content).toContain("getCredentialTier");
    expect(content).toContain("credentialStorageRequireEncryption");
  });

  test("enterprise-types.ts exports required type definitions", () => {
    expect(existsSync(ENTERPRISE_TYPES)).toBe(true);
    const content = readFileSync(ENTERPRISE_TYPES, "utf-8");
    expect(content).toContain("export interface EnterpriseAuthConfig");
    expect(content).toContain("export interface EnterpriseUser");
    expect(content).toContain("export interface EnterpriseAuthResult");
  });

  test("EnterpriseUser uses oid as identity key, not preferred_username", () => {
    const content = readFileSync(ENTERPRISE_TYPES, "utf-8");
    // oid must be present as a field
    expect(content).toMatch(/oid:\s*string/);
    // preferred_username must NOT be a typed field (comments mentioning it are fine)
    expect(content).not.toMatch(/preferred_username\s*[?:]?\s*string/);
  });

  // Isolation assertion removed — wiring is now permitted per change #2 (wire-enterprise-auth).
  // The enterprise-auth-wiring.test.ts guard validates the wiring is correct.

  test("package.json includes MSAL and jose dependencies", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
    const deps = pkg.dependencies ?? {};
    expect(deps["@azure/msal-node"]).toBeDefined();
    expect(deps["@azure/msal-node-extensions"]).toBeDefined();
    expect(deps["jose"]).toBeDefined();
  });

  // Positive control: verify modules contain expected MSAL patterns
  test("positive control: enterprise-auth.ts uses PublicClientApplication", () => {
    const content = readFileSync(ENTERPRISE_AUTH, "utf-8");
    expect(content).toContain("PublicClientApplication");
    expect(content).toContain("acquireTokenInteractive");
    expect(content).toContain("acquireTokenSilent");
  });
});
