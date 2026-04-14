import { clipboard, shell } from "electron";
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import which from "which";
import { z } from "zod";
import { authedProcedure, publicProcedure, router } from "../index";
import {
  APP_META,
  externalAppSchema,
  type AppMeta,
  type ExternalApp,
} from "../../../../shared/external-apps";

function expandTilde(filePath: string): string {
  if (filePath.startsWith("~/") || filePath === "~") {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function spawnAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    child.on("error", reject);
    // Resolve immediately — we just need to launch the app
    resolve();
  });
}

async function isAppInstalled(meta: AppMeta): Promise<boolean> {
  // Primary: PATH-based detection via `which`. Cross-platform (Windows `where.exe`
  // with PATHEXT, Unix `which`). Returns a path string or null without throwing.
  if (meta.cliBinary) {
    const resolved = await which(meta.cliBinary, { nothrow: true });
    if (resolved) return true;
  }
  // Secondary fallback: macOS `.app` bundle check for GUI-only editors without
  // a CLI launcher. Unix `fs.existsSync` is still correct on macOS; on Windows
  // and Linux these paths simply won't exist, which is the desired behavior.
  const paths = [
    `/Applications/${meta.macAppName}.app`,
    `${os.homedir()}/Applications/${meta.macAppName}.app`,
  ];
  return paths.some((p) => fs.existsSync(p));
}

/**
 * Map a raw $EDITOR/$VISUAL binary basename (or full path) to an ExternalApp id.
 * Unknown values return null; the first-paint renderer hook then falls through
 * to first-installed resolution.
 */
function mapEditorEnvToApp(rawValue: string | undefined): ExternalApp | null {
  if (!rawValue) return null;
  const basename = path.basename(rawValue).toLowerCase();
  switch (basename) {
    case "code":
      return "vscode";
    case "code-insiders":
      return "vscode-insiders";
    case "cursor":
      return "cursor";
    case "windsurf":
      return "windsurf";
    case "zed":
      return "zed";
    case "subl":
      return "sublime";
    case "trae":
      return "trae";
    case "idea":
      return "intellij";
    case "webstorm":
      return "webstorm";
    case "pycharm":
      return "pycharm";
    case "phpstorm":
      return "phpstorm";
    case "goland":
      return "goland";
    case "clion":
      return "clion";
    case "rider":
      return "rider";
    case "rustrover":
      return "rustrover";
    case "fleet":
      return "fleet";
    default:
      return null;
  }
}

function mapTermProgramToApp(rawValue: string | undefined): ExternalApp | null {
  if (!rawValue) return null;
  switch (rawValue) {
    case "iTerm.app":
      return "iterm";
    case "WarpTerminal":
      return "warp";
    case "Apple_Terminal":
      return "terminal";
    case "ghostty":
    case "Ghostty":
      return "ghostty";
    default:
      return null;
  }
}

function openPathInApp(app: ExternalApp, targetPath: string): Promise<void> {
  const expandedPath = expandTilde(targetPath);

  if (app === "finder") {
    shell.showItemInFolder(expandedPath);
    return Promise.resolve();
  }

  const meta = APP_META[app];
  return spawnAsync("open", ["-a", meta.macAppName, expandedPath]);
}

/**
 * External router for shell operations (open in finder, open in editor, etc.)
 */
export const externalRouter = router({
  openInFinder: publicProcedure
    .input(z.string())
    .mutation(async ({ input: inputPath }) => {
      const expandedPath = expandTilde(inputPath);
      shell.showItemInFolder(expandedPath);
      return { success: true };
    }),

  openInApp: publicProcedure
    .input(
      z.object({
        path: z.string(),
        app: externalAppSchema,
      }),
    )
    .mutation(async ({ input }) => {
      await openPathInApp(input.app, input.path);
      return { success: true };
    }),

  copyPath: publicProcedure
    .input(z.string())
    .mutation(({ input: inputPath }) => {
      clipboard.writeText(inputPath);
      return { success: true };
    }),

  openFileInEditor: publicProcedure
    .input(
      z.object({
        path: z.string(),
        cwd: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { cwd } = input;
      const filePath = input.path.startsWith("~")
        ? input.path.replace("~", os.homedir())
        : input.path;

      // Try common code editors in order of preference
      const editors = [
        { cmd: "cursor", args: [filePath] }, // Cursor
        { cmd: "code", args: [filePath] }, // VS Code
        { cmd: "subl", args: [filePath] }, // Sublime Text
        { cmd: "atom", args: [filePath] }, // Atom
        { cmd: "open", args: ["-t", filePath] }, // macOS default text editor
      ];

      for (const editor of editors) {
        try {
          // Check if the command exists first
          execFileSync("which", [editor.cmd], { stdio: "ignore" });
          const child = spawn(editor.cmd, editor.args, {
            cwd: cwd || undefined,
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          return { success: true, editor: editor.cmd };
        } catch {
          // Try next editor
          continue;
        }
      }

      // Fallback: use shell.openPath which opens with default app
      await shell.openPath(filePath);
      return { success: true, editor: "default" };
    }),

  openExternal: authedProcedure
    .input(z.string())
    .mutation(async ({ input: url }) => {
      const { safeOpenExternal } = await import("../../safe-external");
      await safeOpenExternal(url);
      return { success: true };
    }),

  getInstalledEditors: publicProcedure.query(async () => {
    const installed: ExternalApp[] = [];
    for (const [id, meta] of Object.entries(APP_META)) {
      if (id === "finder") {
        installed.push(id as ExternalApp);
        continue;
      }
      // macOS: Terminal.app is always available
      if (id === "terminal") {
        installed.push(id as ExternalApp);
        continue;
      }
      if (await isAppInstalled(meta)) {
        installed.push(id as ExternalApp);
      }
    }
    return installed;
  }),

  /**
   * Derive the user's OS-default editor, terminal, and shell from standard
   * environment variables. No `process.platform` branching — Unix-conventional
   * env vars are also set by Git Bash / PowerShell on Windows and by common
   * `.bashrc`/`.zshrc` setups on macOS/Linux. Unknown values return null.
   */
  getOsDefaults: publicProcedure.query(() => {
    const editor = mapEditorEnvToApp(
      process.env.VISUAL ?? process.env.EDITOR,
    );
    const terminal =
      mapTermProgramToApp(process.env.TERM_PROGRAM) ??
      mapTermProgramToApp(process.env.TERM);
    const shell = process.env.SHELL ?? null;
    return { editor, terminal, shell };
  }),
});
