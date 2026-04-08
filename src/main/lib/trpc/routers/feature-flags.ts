/**
 * tRPC router for feature flag management.
 *
 * Thin wrapper over src/main/lib/feature-flags.ts — the router exists so
 * the renderer can read and toggle flags via tRPC (for a future admin UI),
 * and so the rest of the app gets type inference on `trpc.featureFlags.*`.
 *
 * Spec contract:
 *   openspec/changes/add-feature-flag-infrastructure/specs/feature-flags/spec.md
 *
 * Design note: the `set` procedure accepts `z.unknown()` for the `value`
 * field because Zod cannot express "the runtime type of this value must
 * match the type of FLAG_DEFAULTS[key] at lookup time" — the type check
 * happens inside `setFlag` itself via the JSON round-trip guard and the
 * TypeScript generic constraint at the core module's call sites. Callers
 * from within the main process (which have access to the typed `setFlag`
 * helper) should prefer the helper over this router.
 */

import { z } from "zod";
import { router, publicProcedure } from "../index";
import {
  FLAG_DEFAULTS,
  getFlag,
  setFlag,
  clearFlag,
  getAllFlagsWithSources,
  type FeatureFlagKey,
} from "../../feature-flags";

/**
 * Type guard: is the given string a valid flag key?
 * Used to narrow `z.string()` input down to the typed union.
 */
function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FLAG_DEFAULTS, key);
}

export const featureFlagsRouter = router({
  /**
   * Return every known flag with its current value and source.
   * Used by admin UIs and debug panels.
   */
  list: publicProcedure.query(() => {
    return getAllFlagsWithSources();
  }),

  /**
   * Read one flag's effective value. Throws if the key is unknown.
   */
  get: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(({ input }) => {
      if (!isFeatureFlagKey(input.key)) {
        throw new Error(`Unknown feature flag key: ${input.key}`);
      }
      return { key: input.key, value: getFlag(input.key) };
    }),

  /**
   * Override one flag. The value must match the flag's declared type —
   * this is validated at runtime by `setFlag`'s JSON round-trip guard
   * and by the type check inside the core module.
   */
  set: publicProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(({ input }) => {
      if (!isFeatureFlagKey(input.key)) {
        throw new Error(`Unknown feature flag key: ${input.key}`);
      }
      // The runtime type check lives inside setFlag. We cast here because
      // TypeScript cannot prove value matches the flag's declared type
      // from a plain unknown — setFlag will throw if the value is not
      // JSON-serializable, and getFlag's type-mismatch guard will fall
      // back to the default on read if the types diverge at runtime.
      setFlag(
        input.key,
        input.value as ReturnType<typeof getFlag<typeof input.key>>,
      );
      return { key: input.key, value: getFlag(input.key) };
    }),

  /**
   * Remove an override, restoring the default value.
   */
  clear: publicProcedure
    .input(z.object({ key: z.string() }))
    .mutation(({ input }) => {
      if (!isFeatureFlagKey(input.key)) {
        throw new Error(`Unknown feature flag key: ${input.key}`);
      }
      clearFlag(input.key);
      return { key: input.key, value: getFlag(input.key) };
    }),
});
