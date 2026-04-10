// Rebuild native Node modules against the Electron ABI for the host platform.
//
// WHY: Several native modules ship prebuilt binaries that either don't have an
// arm64 variant, don't match our pinned Electron version's NODE_MODULE_VERSION,
// or (in keytar's case — repo archived since 2022) have a frozen prebuild
// matrix that can fall back to the wrong architecture.
//
// Explicitly force-rebuilding them against Electron's local ABI guarantees the
// binaries match both the host architecture and the Electron runtime.
//
// Modules rebuilt:
//   - better-sqlite3: SQLite bindings, used by Drizzle ORM
//   - node-pty:       PTY bindings, used by the integrated terminal (lazy-loaded)
//   - keytar:         OS keystore bindings, used by @azure/msal-node-extensions
//                     for Tier 1 credential persistence (enterprise auth)
//
// Skipped on Vercel (no native build toolchain; these deps are not needed for
// the docs site build).

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

if (process.env.VERCEL) {
  console.log(
    "[rebuild-native-modules] Vercel environment detected; skipping.",
  );
  process.exit(0);
}

const NATIVE_MODULES = ["better-sqlite3", "node-pty", "keytar"];

// Resolve @electron/rebuild's CLI via node module resolution rather than the
// .bin/ symlink. This works across bun, npm, pnpm, and Windows where bun may
// not have created the .bin/electron-rebuild.cmd shim yet at postinstall time.
const require = createRequire(import.meta.url);

let electronRebuildCli;
try {
  // Resolve @electron/rebuild's main entry, then derive the CLI path relative
  // to it. The package exports its main as `lib/main.js` and its CLI as
  // `lib/cli.js` in the same directory. We can't use
  // `require.resolve("@electron/rebuild/package.json")` because the package's
  // `exports` field doesn't list `./package.json`.
  const main = require.resolve("@electron/rebuild");
  // main = .../node_modules/@electron/rebuild/lib/main.js
  electronRebuildCli = join(dirname(main), "cli.js");
} catch (err) {
  // If @electron/rebuild isn't installed yet (e.g. first-time install on an
  // env without devDeps), skip rather than hard-fail. The install step should
  // run this again once devDeps are present.
  console.warn(
    `[rebuild-native-modules] @electron/rebuild not resolvable: ${err.message}`,
  );
  console.warn(
    "[rebuild-native-modules] Skipping native rebuild. If you're running `bun install` for the first time, this is expected; re-run `bun install` once devDeps are present.",
  );
  process.exit(0);
}

console.log(
  `[rebuild-native-modules] Rebuilding: ${NATIVE_MODULES.join(", ")}`,
);

try {
  execFileSync(
    process.execPath,
    [electronRebuildCli, "-f", "-w", NATIVE_MODULES.join(",")],
    { stdio: "inherit", cwd: root },
  );
} catch (err) {
  console.error("[rebuild-native-modules] Rebuild failed:", err.message);
  process.exit(1);
}

console.log("[rebuild-native-modules] Done.");
