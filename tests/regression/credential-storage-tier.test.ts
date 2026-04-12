/**
 * Regression guard: Credential storage tier enforcement
 *
 * Ensures the unified credential-store.ts module is the sole entry point
 * for credential encryption/decryption, and that no other file calls
 * safeStorage directly. Also verifies the enterprise hard-refusal feature
 * flag exists.
 *
 * Part of the harden-credential-storage OpenSpec change.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";

const SRC_MAIN = path.join(import.meta.dir, "../../src/main");
const CREDENTIAL_STORE = path.join(SRC_MAIN, "lib/credential-store.ts");
const ANTHROPIC_ACCOUNTS = path.join(
  SRC_MAIN,
  "lib/trpc/routers/anthropic-accounts.ts",
);
const CLAUDE_CODE = path.join(SRC_MAIN, "lib/trpc/routers/claude-code.ts");
const CLAUDE = path.join(SRC_MAIN, "lib/trpc/routers/claude.ts");
const AUTH_STORE = path.join(SRC_MAIN, "auth-store.ts");
const FEATURE_FLAGS = path.join(SRC_MAIN, "lib/feature-flags.ts");

/** Recursively collect all .ts files under a directory */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

const SAFE_STORAGE_PATTERN =
  /safeStorage\.(encryptString|decryptString|isEncryptionAvailable)/;

describe("credential-storage-tier", () => {
  test("credential-store.ts exists and exports required symbols", () => {
    expect(existsSync(CREDENTIAL_STORE)).toBe(true);
    const content = readFileSync(CREDENTIAL_STORE, "utf-8");

    expect(content).toContain("export type CredentialTier");
    expect(content).toContain("export class CredentialStorageRefusedError");
    expect(content).toContain("export function getCredentialTier");
    expect(content).toContain("export function encryptCredential");
    expect(content).toContain("export function decryptCredential");
  });

  test("credential-store.ts implements 3-tier detection", () => {
    const content = readFileSync(CREDENTIAL_STORE, "utf-8");

    expect(content).toContain("isEncryptionAvailable");
    expect(content).toContain("getSelectedStorageBackend");
    expect(content).toContain("basic_text");
  });

  test("no direct safeStorage encrypt/decrypt calls outside credential-store.ts", () => {
    const allFiles = collectTsFiles(SRC_MAIN);
    const violators: string[] = [];

    for (const file of allFiles) {
      if (file === CREDENTIAL_STORE) continue;
      const content = readFileSync(file, "utf-8");
      if (SAFE_STORAGE_PATTERN.test(content)) {
        violators.push(path.relative(SRC_MAIN, file));
      }
    }

    expect(violators).toEqual([]);
  });

  test("anthropic-accounts.ts has no local encryptToken or decryptToken", () => {
    const content = readFileSync(ANTHROPIC_ACCOUNTS, "utf-8");
    expect(content).not.toMatch(/^function encryptToken/m);
    expect(content).not.toMatch(/^function decryptToken/m);
  });

  test("claude-code.ts has no local encryptToken or decryptToken", () => {
    const content = readFileSync(CLAUDE_CODE, "utf-8");
    expect(content).not.toMatch(/^function encryptToken/m);
    expect(content).not.toMatch(/^function decryptToken/m);
  });

  test("claude.ts has no local decryptToken", () => {
    const content = readFileSync(CLAUDE, "utf-8");
    expect(content).not.toMatch(/^function decryptToken/m);
  });

  test("auth-store.ts does not import safeStorage directly", () => {
    const content = readFileSync(AUTH_STORE, "utf-8");
    expect(content).not.toContain("safeStorage");
  });

  test("FLAG_DEFAULTS includes credentialStorageRequireEncryption", () => {
    const content = readFileSync(FEATURE_FLAGS, "utf-8");
    expect(content).toContain("credentialStorageRequireEncryption");
  });

  // Positive control: verify target files exist and contain known symbols
  test("positive control: target files exist with expected imports", () => {
    const accounts = readFileSync(ANTHROPIC_ACCOUNTS, "utf-8");
    expect(accounts).toContain("anthropicAccountsRouter");
    expect(accounts).toContain("encryptCredential");

    const claudeCode = readFileSync(CLAUDE_CODE, "utf-8");
    expect(claudeCode).toContain("storeOAuthToken");
    expect(claudeCode).toContain("encryptCredential");

    const claude = readFileSync(CLAUDE, "utf-8");
    expect(claude).toContain("decryptCredential");

    const authStore = readFileSync(AUTH_STORE, "utf-8");
    expect(authStore).toContain("encryptCredential");
    expect(authStore).toContain("decryptCredential");
  });
});
