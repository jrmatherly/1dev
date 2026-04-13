/**
 * Regression guard: legacy LITELLM_PROXY_URL env var is fully removed.
 *
 * add-dual-mode-llm-routing renamed the LiteLLM proxy URL env var to
 * MAIN_VITE_LITELLM_BASE_URL to match the Electron-desktop prefix convention.
 * Any re-introduction of the old name would silently break LiteLLM routing
 * in packaged builds (electron-vite only injects MAIN_VITE_* into the main
 * process), so the guard scans src/main/ to keep the rename honest.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const SRC_MAIN = path.join(import.meta.dir, "../../src/main");

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("no legacy LITELLM_PROXY_URL", () => {
  test("src/main/ contains no reference to LITELLM_PROXY_URL", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_MAIN)) {
      const content = readFileSync(file, "utf-8");
      if (content.includes("LITELLM_PROXY_URL")) {
        offenders.push(path.relative(SRC_MAIN, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("MAIN_VITE_LITELLM_BASE_URL is the canonical name (positive control)", () => {
    const claudeTs = readFileSync(
      path.join(SRC_MAIN, "lib/trpc/routers/claude.ts"),
      "utf-8",
    );
    // deriveClaudeSpawnEnv call must pull from the new env var
    expect(claudeTs).toContain("MAIN_VITE_LITELLM_BASE_URL");
  });
});
