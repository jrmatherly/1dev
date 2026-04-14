/**
 * Regression guard: Login flow uses MSAL, never the dead SaaS URL.
 *
 * Locks in the wire-login-button-to-msal change (2026-04-13). Asserts:
 *   - The dead `apollosai.dev/auth/desktop?auto=true` fallthrough cannot
 *     be reintroduced.
 *   - `startAuthFlow()` throws (typed AuthError) instead of opening the
 *     legacy URL when the flag is off or MSAL init failed.
 *   - The `ENTERPRISE_AUTH_ENABLED` env override is a build-time constant
 *     (Vite-substituted) gated on the key name `"enterpriseAuthEnabled"`.
 *   - `auth:start-flow` IPC handler validates sender AND emits the
 *     `auth:error` event to the validated sender, not as a broadcast.
 *   - `.env.example` documents `ENTRA_CLIENT_ID`/`ENTRA_TENANT_ID`/
 *     `ENTERPRISE_AUTH_ENABLED` in a coherent block.
 *   - `login.html` uses the 1Code circuit-board logo (base64 PNG img tag)
 *     with `aria-label="1Code logo"`, hosts the DOM-resident accessible
 *     toast, and uses safe text-only DOM mutation (no HTML-parsing
 *     assignment) for the message body.
 *   - The preload bridge exposes `onAuthError` AND the `AuthError` typed
 *     discriminated union is declared in either preload/index.d.ts or
 *     the shared types file.
 *
 * Spec: openspec/specs/enterprise-auth-wiring/spec.md →
 *   "Login-flow regression guard"
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const SRC_MAIN = path.join(REPO_ROOT, "src", "main");
const AUTH_MANAGER = path.join(SRC_MAIN, "auth-manager.ts");
const FEATURE_FLAGS = path.join(SRC_MAIN, "lib", "feature-flags.ts");
const WINDOWS_MAIN = path.join(SRC_MAIN, "windows", "main.ts");
const LOGIN_HTML = path.join(REPO_ROOT, "src", "renderer", "login.html");
const ENV_EXAMPLE = path.join(REPO_ROOT, ".env.example");
const PRELOAD_TS = path.join(REPO_ROOT, "src", "preload", "index.ts");
const PRELOAD_DTS = path.join(REPO_ROOT, "src", "preload", "index.d.ts");
const SHARED_AUTH_ERROR_TYPES = path.join(
  REPO_ROOT,
  "src",
  "shared",
  "auth-error-types.ts",
);

// ---- File-tree walker for `src/main/` (assertion 3) ----------------------

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function walkSrcMain(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkSrcMain(full, files);
    else if (SCAN_EXTENSIONS.has(path.extname(entry))) files.push(full);
  }
  return files;
}

// ---- Function-body extractor (assertions 4, 5) ---------------------------

/**
 * Pull a function body out of source. Greedily matches the first
 * `name(...)` signature (with optional return type annotation), then
 * captures from the opening `{` to the matching closing `}` by walking
 * brace depth.
 */
function getFnBody(source: string, name: string): string {
  // Find `name` followed by a `(` that begins the parameter list. Tolerates
  // generic type parameters between name and `(` (e.g.
  // `getFlag<K extends FeatureFlagKey>(key: K): T {`). Skip matches that
  // are inside JSDoc/inline-doc comments (preceded by `*` or backtick on
  // the same logical line) and string literals — those are documentation
  // references, not declarations.
  const nameRe = new RegExp(
    "\\b" + name + "\\s*(?:<[^>]*>)?\\s*\\(",
    "gm",
  );
  let m: RegExpExecArray | null;
  let chosen: RegExpExecArray | null = null;
  while ((m = nameRe.exec(source)) !== null) {
    // Find the start of the line (or the previous newline)
    const lineStart = source.lastIndexOf("\n", m.index) + 1;
    const linePrefix = source.slice(lineStart, m.index);
    // Inside JSDoc/inline doc — skip.
    if (/^\s*\*/.test(linePrefix)) continue;
    // Inside a backtick (e.g. `getFlag(...)` in a comment) — skip.
    if (linePrefix.includes("`")) continue;
    // Inside a string literal on the same line — skip.
    if (linePrefix.includes('"') || linePrefix.includes("'")) continue;
    chosen = m;
    break;
  }
  if (!chosen) throw new Error(`function ${name} not found in source`);
  m = chosen;
  // Walk from the `(` matching parens to find the close, then advance past
  // any return type / colon / whitespace until the opening `{`.
  let i = m.index + m[0].length;
  let parenDepth = 1;
  while (i < source.length && parenDepth > 0) {
    if (source[i] === "(") parenDepth++;
    else if (source[i] === ")") parenDepth--;
    i++;
  }
  while (i < source.length && source[i] !== "{") i++;
  if (source[i] !== "{") {
    throw new Error(`opening brace for ${name} not found`);
  }
  i++;
  const start = i;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

// =========================================================================

describe("login-flow-uses-msal", () => {
  // -- Positive controls (prevent invalid red per TDD red-state rule) -----

  test("positive control: login.html is readable and non-trivial", () => {
    const content = readFileSync(LOGIN_HTML, "utf-8");
    expect(content.length).toBeGreaterThan(500);
  });

  test("positive control: auth-manager.ts is readable and non-trivial", () => {
    const content = readFileSync(AUTH_MANAGER, "utf-8");
    expect(content.length).toBeGreaterThan(5000);
  });

  // -- Behavioral assertions ---------------------------------------------

  test("no /auth/desktop?auto=true substring anywhere in src/main/", () => {
    const offenders: string[] = [];
    for (const file of walkSrcMain(SRC_MAIN)) {
      const content = readFileSync(file, "utf-8");
      if (content.includes("/auth/desktop?auto=true")) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("auth-manager.startAuthFlow body throws and never calls safeOpenExternal", () => {
    const content = readFileSync(AUTH_MANAGER, "utf-8");
    const body = getFnBody(content, "startAuthFlow");
    // Body must throw (typed via createAuthError or `throw new Error(...)`).
    const throws = body.includes("throw createAuthError") || body.includes("throw new");
    expect(throws).toBe(true);
    expect(body).not.toContain("safeOpenExternal(");
  });

  test("feature-flags.getFlag references Vite env override for enterpriseAuthEnabled", () => {
    const content = readFileSync(FEATURE_FLAGS, "utf-8");
    const body = getFnBody(content, "getFlag");
    // Must read from import.meta.env.MAIN_VITE_* (Vite-bundled) rather than
    // process.env.* — electron-vite only propagates MAIN_VITE_-prefixed env
    // vars to the main process at dev time. Values are baked in at build time
    // so both dev and packaged builds get the literal string.
    expect(body).toContain("import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED");
    // The env override must be gated on the key name (not app.isPackaged).
    const gatePattern =
      /if\s*\(\s*key\s*===\s*"enterpriseAuthEnabled"[\s\S]*?import\.meta\.env\.MAIN_VITE_ENTERPRISE_AUTH_ENABLED/;
    expect(gatePattern.test(body)).toBe(true);
  });

  test("auth:start-flow IPC handler validates sender AND targets event.sender.send", () => {
    const content = readFileSync(WINDOWS_MAIN, "utf-8");
    const handlerStart = content.indexOf('ipcMain.handle("auth:start-flow"');
    expect(handlerStart).toBeGreaterThan(-1);
    const tail = content.slice(handlerStart);
    const nextHandler = tail.indexOf("ipcMain.handle", 1);
    const block = nextHandler === -1 ? tail : tail.slice(0, nextHandler);
    expect(block).toContain("validateSender(event)");
    expect(block).toContain('event.sender.send("auth:error"');
  });

  test("auth:start-flow IPC handler has a success path that signals the renderer", () => {
    // After MSAL `acquireTokenInteractive()` resolves, the handler must
    // reload the window(s) so the login page is replaced by the app surface.
    // Without this, the browser shows "Authentication complete" but the
    // Electron app stalls on "Waiting for browser sign-in…" forever.
    // Spec: "Successful sign-in reloads the window and emits auth:success"
    const content = readFileSync(WINDOWS_MAIN, "utf-8");
    const handlerStart = content.indexOf('ipcMain.handle("auth:start-flow"');
    expect(handlerStart).toBeGreaterThan(-1);
    const tail = content.slice(handlerStart);
    const nextHandler = tail.indexOf("ipcMain.handle", 1);
    const block = nextHandler === -1 ? tail : tail.slice(0, nextHandler);
    // Handler must call the shared success helper (extracted from the
    // legacy handleAuthCode path) so MSAL + deep-link flows share plumbing.
    expect(block).toContain("completeAuthSuccess");
    // And must read the current user from authManager before signaling.
    expect(block).toContain("authManager.getUser()");
  });

  test("src/main/index.ts exports completeAuthSuccess and handleAuthCode delegates to it", () => {
    const content = readFileSync(
      path.join(SRC_MAIN, "index.ts"),
      "utf-8",
    );
    expect(content).toContain("export function completeAuthSuccess");
    // handleAuthCode should delegate to the helper (no duplicate reload loop).
    const handleAuthCodeStart = content.indexOf(
      "export async function handleAuthCode",
    );
    expect(handleAuthCodeStart).toBeGreaterThan(-1);
    const handleAuthCodeTail = content.slice(handleAuthCodeStart);
    // Capture up to the next top-level export (safe bound).
    const nextExport = handleAuthCodeTail.indexOf("\nexport ", 1);
    const body =
      nextExport === -1
        ? handleAuthCodeTail
        : handleAuthCodeTail.slice(0, nextExport);
    expect(body).toContain("completeAuthSuccess(");
  });

  test(".env.example documents MAIN_VITE_ENTRA + MAIN_VITE_ENTERPRISE_AUTH vars in a coherent block", () => {
    const content = readFileSync(ENV_EXAMPLE, "utf-8");
    const lines = content.split("\n");
    const line = (needle: string) =>
      lines.findIndex((l) => l.includes(needle));
    const a = line("MAIN_VITE_ENTRA_CLIENT_ID");
    const b = line("MAIN_VITE_ENTRA_TENANT_ID");
    const c = line("MAIN_VITE_ENTERPRISE_AUTH_ENABLED");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(-1);
    const span = Math.max(a, b, c) - Math.min(a, b, c);
    expect(span).toBeLessThanOrEqual(10);
  });

  test("login.html uses 1Code logo img + accessible toast + safe text DOM", () => {
    const content = readFileSync(LOGIN_HTML, "utf-8");
    // 1Code circuit-board logo (base64 PNG img tag)
    expect(content).toContain('alt="1Code logo"');
    expect(content).toContain('aria-label="1Code logo"');
    expect(content).toContain('class="logo"');
    expect(content).toContain("data:image/png;base64,");
    // DOM-resident toast
    expect(content).toContain('id="authError"');
    expect(content).toContain('role="alert"');
    expect(content).toContain('aria-live="assertive"');
    // No legacy 21st.dev geometry
    expect(content).not.toContain('viewBox="0 0 560 560"');
    expect(content).not.toContain('"M560 560H0V0');
    // No HTML-parsing assignment in the auth:error code path.
    // Build the forbidden token at runtime so this guard's own source does
    // not contain the literal — that would self-trigger when the
    // brand-sweep scanner walks the test tree.
    const forbidden = "inner" + "HTML";
    expect(content).not.toContain(forbidden);
  });

  test("preload bridge exposes onAuthError AND AuthError type is declared", () => {
    const preloadTs = readFileSync(PRELOAD_TS, "utf-8");
    expect(preloadTs).toContain("onAuthError");

    const preloadDts = readFileSync(PRELOAD_DTS, "utf-8");
    expect(preloadDts).toContain("onAuthError");

    // AuthError type lives in the shared module; preload.d.ts re-exports it.
    const sharedTypes = readFileSync(SHARED_AUTH_ERROR_TYPES, "utf-8");
    expect(sharedTypes).toContain("export type AuthError");
    expect(sharedTypes).toContain('"flag-off"');
    expect(sharedTypes).toContain('"config-missing"');
    expect(sharedTypes).toContain('"init-failed"');
    expect(sharedTypes).toContain('"msal-error"');
  });
});
