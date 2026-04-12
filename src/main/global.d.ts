/**
 * Global augmentations for runtime-bolted-on properties.
 *
 * The main process mounts a handful of properties on `globalThis` for
 * cross-module communication (menu rebuild callbacks, devtools unlock flag,
 * auto-updater state). These properties are assigned dynamically at startup
 * and read from multiple files. Declaring them here gives us proper types
 * instead of `(global as any).__xyz` escape hatches.
 *
 * Keep this list tight — the preferred pattern is tRPC routers or event
 * emitters, not global assignments.
 */

export {};

declare global {
  // eslint-disable-next-line no-var
  var __devToolsUnlocked: boolean | undefined;
  // eslint-disable-next-line no-var
  var __unlockDevTools: (() => void) | undefined;
  // eslint-disable-next-line no-var
  var __setUpdateAvailable:
    | ((available: boolean, version?: string) => void)
    | undefined;
}
