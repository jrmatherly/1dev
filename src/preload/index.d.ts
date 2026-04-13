export interface UpdateInfo {
  version: string
  releaseDate?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

/**
 * Discriminated union for auth-flow errors crossing the IPC boundary.
 * Emitted by the main-process `auth:start-flow` handler in
 * `src/main/windows/main.ts` after passing the original error through
 * `formatAuthError()` for sanitization and dev-vs-end-user wording.
 *
 * The canonical type lives at src/shared/auth-error-types.ts; this
 * re-export keeps backwards compatibility for any consumer that
 * imports from "@preload" or the ambient `DesktopApi` namespace.
 *
 * Spec: openspec/specs/enterprise-auth-wiring/spec.md →
 *   "Auth error IPC payload is a typed discriminated union"
 */
export type { AuthError } from "../shared/auth-error-types"
import type { AuthError } from "../shared/auth-error-types"

export interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

export interface WorktreeSetupFailurePayload {
  kind: "create-failed" | "setup-failed"
  message: string
  projectId: string
}

export interface DesktopApi {
  // Platform info
  platform: NodeJS.Platform
  arch: string
  getVersion: () => Promise<string>

  // Auto-update
  checkForUpdates: (force?: boolean) => Promise<UpdateInfo | null>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => void
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  onUpdateManualCheck: (callback: () => void) => () => void

  // Window controls
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  windowToggleFullscreen: () => Promise<void>
  windowIsFullscreen: () => Promise<boolean>
  setTrafficLightVisibility: (visible: boolean) => Promise<void>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  onFocusChange: (callback: (isFocused: boolean) => void) => () => void

  // Zoom
  zoomIn: () => Promise<void>
  zoomOut: () => Promise<void>
  zoomReset: () => Promise<void>
  getZoom: () => Promise<number>

  // DevTools
  toggleDevTools: () => Promise<void>

  // Analytics
  setAnalyticsOptOut: (optedOut: boolean) => Promise<void>

  // Native features
  setBadge: (count: number | null) => Promise<void>
  showNotification: (options: { title: string; body: string }) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getApiBaseUrl: () => Promise<string>

  // Clipboard
  clipboardWrite: (text: string) => Promise<void>
  clipboardRead: () => Promise<string>

  // Auth
  getUser: () => Promise<DesktopUser | null>
  isAuthenticated: () => Promise<boolean>
  logout: () => Promise<void>
  startAuthFlow: () => Promise<void>
  submitAuthCode: (code: string) => Promise<void>
  updateUser: (updates: { name?: string }) => Promise<DesktopUser | null>
  onAuthSuccess: (callback: (user: any) => void) => () => void
  onAuthError: (callback: (payload: AuthError | string) => void) => () => void

  // Multi-window
  newWindow: (options?: { chatId?: string; subChatId?: string }) => Promise<{ blocked: boolean } | void>

  // Chat ownership — prevent same chat open in multiple windows
  claimChat: (chatId: string) => Promise<{ ok: true } | { ok: false; ownerStableId: string }>
  releaseChat: (chatId: string) => Promise<void>
  focusChatOwner: (chatId: string) => Promise<boolean>

  // Shortcuts
  onShortcutNewAgent: (callback: () => void) => () => void

  // Worktree setup failures
  onWorktreeSetupFailed: (callback: (payload: WorktreeSetupFailurePayload) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
