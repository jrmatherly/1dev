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
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
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

const electronRebuildBin = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-rebuild.cmd" : "electron-rebuild",
);

if (!existsSync(electronRebuildBin)) {
  console.error(
    `[rebuild-native-modules] electron-rebuild not found at ${electronRebuildBin}`,
  );
  console.error(
    "[rebuild-native-modules] Ensure @electron/rebuild is installed.",
  );
  process.exit(1);
}

console.log(
  `[rebuild-native-modules] Rebuilding: ${NATIVE_MODULES.join(", ")}`,
);

try {
  execFileSync(electronRebuildBin, ["-f", "-w", NATIVE_MODULES.join(",")], {
    stdio: "inherit",
    cwd: root,
  });
} catch (err) {
  console.error("[rebuild-native-modules] Rebuild failed:", err.message);
  process.exit(1);
}

console.log("[rebuild-native-modules] Done.");
