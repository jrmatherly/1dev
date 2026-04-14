import { BrowserWindow, ipcMain, app } from "electron";
import log from "electron-log";
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
} from "electron-updater";

/**
 * IMPORTANT: Do NOT use lazy/dynamic imports for electron-updater!
 *
 * In v0.0.6 we tried using async getAutoUpdater() with dynamic imports,
 * which broke the auto-updater completely. The synchronous import is required
 * for electron-updater to work correctly.
 *
 * See commit d946614c5 for the broken implementation - do not repeat this mistake.
 */

function initAutoUpdaterConfig() {
  // Configure logging
  log.transports.file.level = "info";
  autoUpdater.logger = log;

  // Configure updater behavior
  autoUpdater.autoDownload = false; // Let user decide when to download
  autoUpdater.autoInstallOnAppQuit = true; // Install on quit if downloaded
  autoUpdater.autoRunAppAfterInstall = true; // Restart app after install
}

// Minimum interval between update checks (prevent spam on rapid focus/blur)
const MIN_CHECK_INTERVAL = 60 * 1000; // 1 minute
let lastCheckTime = 0;

// Channel is always "latest" for this iteration. Beta channel support
// was removed because electron-builder requires `generateUpdatesFilesForAllChannels: true`
// in package.json build config to emit beta-mac.yml manifests, AND
// electron-updater's GitHub provider's default path hits /releases/latest
// which skips prereleases — making the beta channel silently 404.
// See: https://www.electron.build/tutorials/release-using-channels
// Re-add when the beta channel can be supported end-to-end (manifest
// generation + allowPrerelease + UI toggle).

let getAllWindows: (() => BrowserWindow[]) | null = null;

/**
 * Send update event to all renderer windows
 * Update events are app-wide and should be visible in all windows
 */
function sendToAllRenderers(channel: string, data?: unknown) {
  const windows = getAllWindows?.() ?? BrowserWindow.getAllWindows();
  for (const win of windows) {
    try {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    } catch {
      // Window may have been destroyed between check and send
    }
  }
}

/**
 * Initialize the auto-updater with event handlers and IPC
 */
export async function initAutoUpdater(getWindows: () => BrowserWindow[]) {
  getAllWindows = getWindows;

  // Initialize config
  initAutoUpdaterConfig();

  // Hard-lock to "latest" channel (see comment at top of file for why beta
  // channel is disabled).
  autoUpdater.channel = "latest";
  autoUpdater.allowDowngrade = false;

  // Feed URL is auto-configured by electron-updater from `app-update.yml`
  // (baked into the packaged app at build time from package.json
  // `build.publish`, which is provider:"github"). No runtime setFeedURL
  // is needed; electron-updater's GitHub provider talks directly to the
  // GitHub Releases API and honors GitHub's own cache headers.

  // Event: Checking for updates
  autoUpdater.on("checking-for-update", () => {
    log.info("[AutoUpdater] Checking for updates...");
    sendToAllRenderers("update:checking");
  });

  // Event: Update available
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update available: v${info.version}`);
    // Update menu to show "Update to vX.X.X..."
    const setUpdateAvailable = globalThis.__setUpdateAvailable;
    if (setUpdateAvailable) {
      setUpdateAvailable(true, info.version);
    }
    sendToAllRenderers("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // Event: No update available
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] App is up to date (v${info.version})`);
    sendToAllRenderers("update:not-available", {
      version: info.version,
    });
  });

  // Event: Download progress
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    log.info(
      `[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}% ` +
        `(${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`,
    );
    sendToAllRenderers("update:progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  // Event: Update downloaded
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update downloaded: v${info.version}`);
    const setUpdateAvailable = globalThis.__setUpdateAvailable;
    if (process.platform === "darwin") {
      // On macOS, electron-updater fires "update-downloaded" when its own
      // download completes, BEFORE Squirrel.Mac attempts the install.
      // Squirrel silently fails on unsigned builds, so keep the menu
      // showing "Update to vX.X.X..." — the click handler redirects to
      // GitHub Releases for manual download.
      log.warn(
        "[AutoUpdater] macOS: update downloaded but Squirrel.Mac install " +
          "may fail on unsigned builds. Menu keeps update prompt.",
      );
    } else {
      // On Windows/Linux, the download completing means the update is
      // ready to install on next quit.
      if (setUpdateAvailable) {
        setUpdateAvailable(false);
      }
    }
    sendToAllRenderers("update:downloaded", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // Event: Error
  autoUpdater.on("error", (error: Error) => {
    log.error("[AutoUpdater] Error:", error.message);
    if (
      process.platform === "darwin" &&
      (error.message.includes("Code signature") ||
        error.message.includes("Squirrel") ||
        error.message.includes("Could not get code signature"))
    ) {
      log.warn(
        "[AutoUpdater] macOS Squirrel code signature failure — " +
          "expected for unsigned builds. Users should download from GitHub Releases.",
      );
    }
    sendToAllRenderers("update:error", error.message);
  });

  // Register IPC handlers
  registerIpcHandlers();

  log.info(
    "[AutoUpdater] Initialized — feed URL auto-configured from app-update.yml (GitHub provider)",
  );
}

/**
 * Register IPC handlers for update operations
 */
function registerIpcHandlers() {
  // Check for updates
  ipcMain.handle("update:check", async (_event, force?: boolean) => {
    if (!app.isPackaged) {
      log.info("[AutoUpdater] Skipping update check in dev mode");
      return null;
    }
    // `force` used to trigger cache-busting against the legacy Cloudflare
    // CDN. The GitHub provider reads from the GitHub Releases API which
    // doesn't have stale edge caches, so we just log the intent and run a
    // normal check. The parameter is kept for IPC compatibility; remove
    // once the renderer stops passing it.
    if (force) {
      log.info(
        "[AutoUpdater] Force check requested (no cache-bust needed with GitHub provider)",
      );
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo || null;
    } catch (error) {
      log.error("[AutoUpdater] Check failed:", error);
      return null;
    }
  });

  // Download update
  ipcMain.handle("update:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      log.error("[AutoUpdater] Download failed:", error);
      return false;
    }
  });

  // Install update and restart
  ipcMain.handle("update:install", () => {
    log.info("[AutoUpdater] Installing update and restarting...");
    // Give renderer time to save state
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 100);
  });

  // Get current update state (useful for re-renders)
  ipcMain.handle("update:get-state", () => {
    return {
      currentVersion: app.getVersion(),
    };
  });

  // Beta channel IPC handlers (update:set-channel, update:get-channel) were
  // removed because the beta channel is broken — see comment at top of file.
  // No renderer callers exist (confirmed via grep 2026-04-10).
}

/**
 * Manually trigger an update check
 * @param force - Skip the minimum interval check
 */
export async function checkForUpdates(force = false) {
  if (!app.isPackaged) {
    log.info("[AutoUpdater] Skipping update check in dev mode");
    return null;
  }

  // Respect minimum interval to prevent spam
  const now = Date.now();
  if (!force && now - lastCheckTime < MIN_CHECK_INTERVAL) {
    log.info(
      `[AutoUpdater] Skipping check - last check was ${Math.round((now - lastCheckTime) / 1000)}s ago`,
    );
    return null;
  }

  lastCheckTime = now;
  return autoUpdater.checkForUpdates();
}

/**
 * Start downloading the update
 */
export async function downloadUpdate() {
  if (!app.isPackaged) {
    log.info("[AutoUpdater] Skipping download in dev mode");
    return false;
  }

  try {
    log.info("[AutoUpdater] Starting update download...");
    await autoUpdater.downloadUpdate();
    return true;
  } catch (error) {
    log.error("[AutoUpdater] Download failed:", error);
    return false;
  }
}

/**
 * Check for updates when window gains focus
 * This is more natural than checking on an interval
 */
export function setupFocusUpdateCheck(_getWindows: () => BrowserWindow[]) {
  // Listen for window focus events
  app.on("browser-window-focus", () => {
    log.info("[AutoUpdater] Window focused - checking for updates");
    checkForUpdates();
  });
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
