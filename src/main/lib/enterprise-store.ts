/**
 * Enterprise token cache persistence for MSAL Node.
 *
 * Implements MSAL's ICachePlugin interface with tier-aware persistence
 * that integrates with credential-store.ts tier detection:
 *
 *   Tier 1 (OS keystore):  @azure/msal-node-extensions platform-native
 *   Tier 2 (basic_text):   File-based fallback + warning
 *   Tier 3 (none):         In-memory only + warning
 *
 * When credentialStorageRequireEncryption is true, Tier 2 → in-memory.
 */

import { app } from "electron";
import { join } from "path";
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node";
import {
  PersistenceCreator,
  PersistenceCachePlugin,
  DataProtectionScope,
} from "@azure/msal-node-extensions";
import { getCredentialTier, type CredentialTier } from "./credential-store";
import { getFlag } from "./feature-flags";

const SERVICE_NAME = "1Code Enterprise Auth";
const ACCOUNT_NAME = "msal-token-cache";
const CACHE_FILE_NAME = "msal-cache.json";

/**
 * In-memory-only ICachePlugin for Tier 3 or enterprise-enforced refusal.
 * Tokens survive the Electron process but not app restart.
 */
class InMemoryCachePlugin implements ICachePlugin {
  private cache: string = "";

  async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    if (this.cache) {
      context.tokenCache.deserialize(this.cache);
    }
  }

  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (context.cacheHasChanged) {
      this.cache = context.tokenCache.serialize();
    }
  }
}

/**
 * Determine the effective persistence tier, accounting for the enterprise
 * flag override that escalates Tier 2 to in-memory.
 */
function getEffectiveTier(): { tier: CredentialTier; useInMemory: boolean } {
  const tier = getCredentialTier();

  if (tier === 3) {
    return { tier, useInMemory: true };
  }

  if (tier === 2 && getFlag("credentialStorageRequireEncryption")) {
    return { tier, useInMemory: true };
  }

  return { tier, useInMemory: false };
}

/**
 * Create the MSAL cache plugin appropriate for the current platform tier.
 *
 * This is an async factory because PersistenceCreator.createPersistence
 * performs async I/O to verify the keystore backend.
 */
export async function createEnterpriseCachePlugin(): Promise<ICachePlugin> {
  const { tier, useInMemory } = getEffectiveTier();

  if (useInMemory) {
    const reason =
      tier === 3
        ? "no secure storage available"
        : "enterprise policy requires real keystore (credentialStorageRequireEncryption=true)";
    console.warn(
      `[EnterpriseStore] Using in-memory cache (tier ${tier}: ${reason}) — MSAL tokens will not persist across restarts`,
    );
    return new InMemoryCachePlugin();
  }

  const cachePath = join(app.getPath("userData"), CACHE_FILE_NAME);

  try {
    const persistence = await PersistenceCreator.createPersistence({
      cachePath,
      dataProtectionScope: DataProtectionScope.CurrentUser,
      serviceName: SERVICE_NAME,
      accountName: ACCOUNT_NAME,
      usePlaintextFileOnLinux: tier === 2, // Allow file fallback on Tier 2
    });

    if (tier === 2) {
      console.warn(
        "[EnterpriseStore] Using file-based cache persistence (tier 2: basic_text backend) — tokens obfuscated, not encrypted",
      );
    } else {
      console.log(
        `[EnterpriseStore] Using platform-native cache persistence (tier 1)`,
      );
    }

    return new PersistenceCachePlugin(persistence);
  } catch (error) {
    console.error(
      "[EnterpriseStore] Failed to create persistent cache, falling back to in-memory:",
      error instanceof Error ? error.message : String(error),
    );
    return new InMemoryCachePlugin();
  }
}
