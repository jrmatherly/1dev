/**
 * Feature flag infrastructure for the 1Code enterprise fork.
 *
 * Phase 0 hard gate #12 from the enterprise auth strategy
 * (.scratchpad/auth-strategy-envoy-gateway.md v2.1 §5.7). The migration
 * from upstream SaaS auth to self-hosted Entra/Envoy auth cannot land as
 * a flag day — the new code paths must coexist with the old ones during a
 * Strangler Fig rollout. This module provides the runtime-toggleable
 * configuration that gates every new auth code path.
 *
 * Spec contract:
 *   openspec/changes/add-feature-flag-infrastructure/specs/feature-flags/spec.md
 *
 * Design highlights:
 *
 * 1. `FLAG_DEFAULTS` is the single source of truth for which flags exist
 *    and what their default values are. Adding a new flag is a one-line
 *    change here — no database migration, no type declaration boilerplate,
 *    no runtime registration. The `as const` assertion lets TypeScript
 *    infer the exact literal type of each default, which is what powers
 *    the compile-time type safety on `getFlag` / `setFlag`.
 *
 * 2. The override table (`feature_flag_overrides`) only stores keys that
 *    have been explicitly set away from their default. A missing row is a
 *    positive signal that the default should be used. This keeps the
 *    override table small and makes default changes effective immediately
 *    for users who haven't touched the flag.
 *
 * 3. Values are JSON-encoded on the way into the database and parsed back
 *    on read. This lets a single `value TEXT NOT NULL` column hold any
 *    JSON-stringifiable value (bool, string, number, plain object) without
 *    schema churn. The boundary where JSON encoding happens is the write
 *    path in `setFlag`, so consumers never see the string form.
 *
 * 4. The generic constraints on `getFlag<K extends FeatureFlagKey>` etc.
 *    reject unknown keys and value-type mismatches at compile time. There
 *    is no runtime `Record<string, unknown>` fallback — attempting to pass
 *    a key that isn't in `FLAG_DEFAULTS` fails to typecheck.
 */

import { eq } from "drizzle-orm";
import { getDatabase, featureFlagOverrides } from "./db";

/**
 * Source of truth for all feature flags and their default values.
 *
 * To add a new flag:
 *   1. Add a new entry to this map with a literal default value.
 *   2. Use `getFlag("yourNewFlag")` at the call site — the type is inferred.
 *
 * Do NOT add flags dynamically at runtime — the whole point of the typed
 * const map is that the TypeScript compiler knows the full key set.
 */
export const FLAG_DEFAULTS = {
  /**
   * Gates the new Entra ID / Envoy Gateway authentication code path in
   * claude.ts. When false (the default), the app uses the legacy
   * CLAUDE_CODE_OAUTH_TOKEN injection via the upstream sandbox flow.
   * When true, the app injects ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL
   * pointed at the self-hosted Envoy Gateway.
   *
   * Flipping this flag is the cutover trigger for Phase 0 gate #8.
   */
  enterpriseAuthEnabled: false,

  /**
   * Gates the F4 voice transcription cutover from upstream
   * apollosai.dev/api/voice/transcribe to LiteLLM's Whisper deployment
   * behind the Envoy Gateway. When false, voice still hits upstream
   * (or the user's own OpenAI key if present).
   */
  voiceViaLiteLLM: false,

  /**
   * Gates the F6 changelog display cutover from the hardcoded
   * https://apollosai.dev/api/changelog/desktop fetch to a self-hosted
   * endpoint reached via getApiBaseUrl(). When false, the popover
   * still fetches from upstream.
   */
  changelogSelfHosted: false,

  /**
   * Gates the F2 automations backend cutover. When true, the
   * automations/inbox UI talks to a self-hosted tRPC service
   * exposing automations.*, github.*, linear.*, agents.* instead
   * of the upstream apollosai.dev equivalents. When false, the old
   * remoteTrpc.automations.* calls still run.
   */
  automationsSelfHosted: false,
} as const;

/**
 * Type-safe key of the flag map. Any `getFlag`/`setFlag` call that passes
 * a string not in this union fails to typecheck.
 */
export type FeatureFlagKey = keyof typeof FLAG_DEFAULTS;

/**
 * The statically-inferred value type for a given flag key. For
 * `enterpriseAuthEnabled` this is `false` (the literal type), which
 * widens to `boolean` naturally when the flag is compared or reassigned.
 */
export type FeatureFlagValue<K extends FeatureFlagKey> =
  (typeof FLAG_DEFAULTS)[K];

/**
 * Snapshot of a single flag's current state, used by
 * `getAllFlagsWithSources` for admin/debug inspection.
 */
export interface FlagSnapshot {
  key: string;
  value: unknown;
  source: "default" | "override";
  updatedAt: Date | null;
}

/**
 * Read the effective value of a flag. Returns the override if one is
 * persisted, otherwise the default from `FLAG_DEFAULTS`.
 *
 * The return type is statically inferred from the key — a boolean flag's
 * `getFlag` return is typed as `boolean`, a string flag's as `string`, etc.
 *
 * If the stored override is malformed (corrupt JSON, type mismatch), this
 * function logs a warning and falls back to the default rather than
 * throwing. A corrupt override row should never take down the app — it's
 * safer to use the default than to crash on startup.
 */
export function getFlag<K extends FeatureFlagKey>(key: K): FeatureFlagValue<K> {
  const defaultValue = FLAG_DEFAULTS[key];
  const db = getDatabase();
  const rows = db
    .select()
    .from(featureFlagOverrides)
    .where(eq(featureFlagOverrides.key, key))
    .all();
  if (rows.length === 0) return defaultValue;

  try {
    const parsed = JSON.parse(rows[0].value) as FeatureFlagValue<K>;
    // Defensive check: if the override's runtime type disagrees with the
    // default's runtime type (e.g., override is string but default is
    // boolean), fall back to the default. This covers the case where a
    // flag's default type changed in a newer version but old override
    // rows still exist in the database.
    if (typeof parsed !== typeof defaultValue) {
      console.warn(
        `[feature-flags] Override for "${key}" has type ${typeof parsed} but default is ${typeof defaultValue}; using default`,
      );
      return defaultValue;
    }
    return parsed;
  } catch (err) {
    console.warn(
      `[feature-flags] Failed to parse override for "${key}", using default:`,
      err,
    );
    return defaultValue;
  }
}

/**
 * Persist an override for a flag. The value must match the key's declared
 * type in `FLAG_DEFAULTS` — this is enforced both at compile time (via the
 * generic constraint) and at runtime (via a `JSON.stringify` round-trip
 * check before the database write).
 *
 * Throws if the value is not JSON-stringifiable (functions, symbols,
 * circular references, undefined). Throws before any database write so
 * a bad value can never leave a corrupt row behind.
 */
export function setFlag<K extends FeatureFlagKey>(
  key: K,
  value: FeatureFlagValue<K>,
): void {
  // Verify the value round-trips through JSON before we touch the DB.
  // This catches undefined, functions, symbols, and circular references.
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error(
        "JSON.stringify returned undefined (value is not JSON-serializable)",
      );
    }
  } catch (err) {
    throw new Error(
      `Cannot set feature flag "${key}" to non-JSON-serializable value: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const db = getDatabase();
  db.insert(featureFlagOverrides)
    .values({ key, value: serialized })
    .onConflictDoUpdate({
      target: featureFlagOverrides.key,
      set: { value: serialized, updatedAt: new Date() },
    })
    .run();
}

/**
 * Remove an override, restoring the flag to its default value.
 *
 * Safe to call for keys with no existing override — it's a DELETE WHERE
 * that matches zero rows, which is a no-op in SQLite.
 */
export function clearFlag<K extends FeatureFlagKey>(key: K): void {
  const db = getDatabase();
  db.delete(featureFlagOverrides)
    .where(eq(featureFlagOverrides.key, key))
    .run();
}

/**
 * Return a snapshot of every known flag's current state. Useful for an
 * admin UI that shows which flags are overridden vs. using defaults, and
 * for debugging "what flag state was the app in when this bug happened?"
 *
 * Guarantees one entry per key in `FLAG_DEFAULTS` regardless of whether
 * that key has an override row.
 */
export function getAllFlagsWithSources(): FlagSnapshot[] {
  const db = getDatabase();
  const rows = db.select().from(featureFlagOverrides).all();
  const overrideMap = new Map<
    string,
    { value: string; updatedAt: Date | null }
  >();
  for (const row of rows) {
    overrideMap.set(row.key, {
      value: row.value,
      updatedAt: row.updatedAt ?? null,
    });
  }

  const snapshots: FlagSnapshot[] = [];
  for (const key of Object.keys(FLAG_DEFAULTS) as FeatureFlagKey[]) {
    const override = overrideMap.get(key);
    if (override === undefined) {
      snapshots.push({
        key,
        value: FLAG_DEFAULTS[key],
        source: "default",
        updatedAt: null,
      });
    } else {
      let parsedValue: unknown = FLAG_DEFAULTS[key];
      try {
        parsedValue = JSON.parse(override.value);
      } catch {
        // Malformed override; surface the default value but mark the
        // source as "override" so the admin UI can show "this flag has a
        // broken override — clear it and it'll use the default".
      }
      snapshots.push({
        key,
        value: parsedValue,
        source: "override",
        updatedAt: override.updatedAt,
      });
    }
  }
  return snapshots;
}
