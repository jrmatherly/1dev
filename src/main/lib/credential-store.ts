import { safeStorage } from "electron";
import { getFlag } from "./feature-flags";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

/**
 * Credential storage tier detected at runtime:
 *   1 = OS keystore (Keychain / DPAPI / libsecret / KWallet)
 *   2 = basic_text backend (Linux hardcoded-password obfuscation)
 *   3 = no encryption available
 */
export type CredentialTier = 1 | 2 | 3;

/**
 * Thrown when credential storage is refused — either Tier 3 (no encryption)
 * or Tier 2 with the enterprise hard-refusal flag enabled.
 */
export class CredentialStorageRefusedError extends Error {
  readonly tier: CredentialTier;
  readonly actionableMessage: string;

  constructor(tier: CredentialTier, actionableMessage: string) {
    super(`Credential storage refused (tier ${tier}): ${actionableMessage}`);
    this.name = "CredentialStorageRefusedError";
    this.tier = tier;
    this.actionableMessage = actionableMessage;
  }
}

// -------------------------------------------------------------------
// Tier detection (cached)
// -------------------------------------------------------------------

const TIER_1_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);

let cachedTier: CredentialTier | null = null;
let cachedBackend: string | null = null;

function detectTier(): { tier: CredentialTier; backend: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { tier: 3, backend: "none" };
  }

  // getSelectedStorageBackend() is Linux-only. On macOS (Keychain) and
  // Windows (DPAPI), isEncryptionAvailable() === true is always Tier 1.
  if (process.platform !== "linux") {
    const backend = process.platform === "darwin" ? "keychain" : "dpapi";
    return { tier: 1, backend };
  }

  const backend = safeStorage.getSelectedStorageBackend();
  if (TIER_1_BACKENDS.has(backend)) {
    return { tier: 1, backend };
  }
  if (backend === "basic_text") {
    return { tier: 2, backend };
  }

  // Unknown backend — treat as Tier 1 (conservative: better to over-trust
  // than to wrongly refuse on a new backend Electron adds later).
  return { tier: 1, backend };
}

/**
 * Returns the detected credential storage tier. Cached after the first call.
 * Must be called after `app.whenReady()`.
 */
export function getCredentialTier(): CredentialTier {
  if (cachedTier !== null) return cachedTier;
  const { tier, backend } = detectTier();
  cachedTier = tier;
  cachedBackend = backend;
  return tier;
}

/**
 * Returns the detected backend name for logging. Only valid after
 * `getCredentialTier()` has been called at least once.
 */
export function getCredentialBackend(): string {
  if (cachedBackend !== null) return cachedBackend;
  getCredentialTier();
  return cachedBackend!;
}

// -------------------------------------------------------------------
// Startup log helper
// -------------------------------------------------------------------

/**
 * Logs the detected tier at startup. Call once from index.ts after
 * app.whenReady().
 */
export function logCredentialTier(): void {
  const tier = getCredentialTier();
  const backend = getCredentialBackend();

  if (tier === 1) {
    console.log(`[CredentialStore] Storage tier: 1 (backend: ${backend})`);
  } else if (tier === 2) {
    console.warn(
      `[CredentialStore] Storage tier: 2 (backend: ${backend}) — WARNING: tokens obfuscated, not encrypted`,
    );
  } else {
    console.error(
      `[CredentialStore] Storage tier: 3 (backend: none) — ERROR: credential storage unavailable`,
    );
  }
}

// -------------------------------------------------------------------
// Encrypt / Decrypt
// -------------------------------------------------------------------

function assertCanEncrypt(tier: CredentialTier): void {
  if (tier === 3) {
    throw new CredentialStorageRefusedError(
      3,
      process.platform === "linux"
        ? "No credential storage backend available. Install gnome-keyring (sudo apt install gnome-keyring) or KWallet, then restart the app."
        : "Credential encryption is not available on this system. Ensure the OS keychain service is running and restart the app.",
    );
  }

  if (tier === 2 && getFlag("credentialStorageRequireEncryption")) {
    throw new CredentialStorageRefusedError(
      2,
      "Enterprise policy requires a real keystore (libsecret/KWallet). The basic_text backend provides only obfuscation. Install gnome-keyring or KWallet, then restart the app.",
    );
  }
}

/**
 * Encrypt a plaintext credential string using the OS keystore.
 * Returns a base64-encoded ciphertext string suitable for storage.
 *
 * Throws `CredentialStorageRefusedError` on Tier 3, or Tier 2 when
 * the `credentialStorageRequireEncryption` flag is enabled.
 */
export function encryptCredential(plaintext: string): string {
  const tier = getCredentialTier();
  assertCanEncrypt(tier);
  return safeStorage.encryptString(plaintext).toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext string previously produced by
 * `encryptCredential`. Throws if the data is corrupted or was encrypted
 * on a different machine/user.
 */
export function decryptCredential(encrypted: string): string {
  const buffer = Buffer.from(encrypted, "base64");
  return safeStorage.decryptString(buffer);
}
