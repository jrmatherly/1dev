import { z } from "zod";

export const EXTERNAL_APPS = [
  "finder",
  "cursor",
  "vscode",
  "vscode-insiders",
  "zed",
  "windsurf",
  "sublime",
  "xcode",
  "warp",
  "terminal",
  "iterm",
  "ghostty",
  "github-desktop",
  "trae",
  "intellij",
  "webstorm",
  "pycharm",
  "phpstorm",
  "rubymine",
  "goland",
  "clion",
  "rider",
  "datagrip",
  "appcode",
  "fleet",
  "rustrover",
] as const;

export const externalAppSchema = z.enum(EXTERNAL_APPS);
export type ExternalApp = z.infer<typeof externalAppSchema>;

export interface AppMeta {
  label: string;
  /** macOS application name used with `open -a` */
  macAppName: string;
  /**
   * CLI launcher binary name consumed by `isAppInstalled()` for cross-platform
   * PATH-based detection via `which`. When set, detection prefers this binary
   * over the macOS `.app` path check. Absent on GUI-only editors that do not
   * ship a CLI launcher (Finder, Xcode, GUI-only terminals, etc.).
   */
  cliBinary?: string;
}

export const APP_META: Record<ExternalApp, AppMeta> = {
  finder: { label: "Finder", macAppName: "Finder" },
  cursor: { label: "Cursor", macAppName: "Cursor", cliBinary: "cursor" },
  vscode: {
    label: "VS Code",
    macAppName: "Visual Studio Code",
    cliBinary: "code",
  },
  "vscode-insiders": {
    label: "VS Code Insiders",
    macAppName: "Visual Studio Code - Insiders",
    cliBinary: "code-insiders",
  },
  zed: { label: "Zed", macAppName: "Zed", cliBinary: "zed" },
  windsurf: {
    label: "Windsurf",
    macAppName: "Windsurf",
    cliBinary: "windsurf",
  },
  sublime: {
    label: "Sublime Text",
    macAppName: "Sublime Text",
    cliBinary: "subl",
  },
  xcode: { label: "Xcode", macAppName: "Xcode" },
  warp: { label: "Warp", macAppName: "Warp" },
  terminal: { label: "Terminal", macAppName: "Terminal" },
  iterm: { label: "iTerm", macAppName: "iTerm" },
  ghostty: { label: "Ghostty", macAppName: "Ghostty" },
  "github-desktop": { label: "GitHub Desktop", macAppName: "GitHub Desktop" },
  trae: { label: "Trae", macAppName: "Trae", cliBinary: "trae" },
  intellij: {
    label: "IntelliJ IDEA",
    macAppName: "IntelliJ IDEA",
    cliBinary: "idea",
  },
  webstorm: {
    label: "WebStorm",
    macAppName: "WebStorm",
    cliBinary: "webstorm",
  },
  pycharm: { label: "PyCharm", macAppName: "PyCharm", cliBinary: "pycharm" },
  phpstorm: {
    label: "PhpStorm",
    macAppName: "PhpStorm",
    cliBinary: "phpstorm",
  },
  rubymine: { label: "RubyMine", macAppName: "RubyMine" },
  goland: { label: "GoLand", macAppName: "GoLand", cliBinary: "goland" },
  clion: { label: "CLion", macAppName: "CLion", cliBinary: "clion" },
  rider: { label: "Rider", macAppName: "Rider", cliBinary: "rider" },
  datagrip: { label: "DataGrip", macAppName: "DataGrip" },
  appcode: { label: "AppCode", macAppName: "AppCode" },
  fleet: { label: "Fleet", macAppName: "Fleet", cliBinary: "fleet" },
  rustrover: {
    label: "RustRover",
    macAppName: "RustRover",
    cliBinary: "rustrover",
  },
};
