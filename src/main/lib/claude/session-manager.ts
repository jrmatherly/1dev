/**
 * Session manager — Claude streaming session + tool-approval state.
 *
 * Extracted from claude.ts as part of security-hardening-and-quality-remediation §7.
 * Holds two module-level Maps:
 *   - activeSessions: subChatId → AbortController for in-flight streams
 *   - pendingToolApprovals: toolUseId → approval callback
 *
 * The Maps are exported directly so callers in claude.ts (the chat
 * subscription handler) can set/get/delete entries without a wrapper layer.
 * Public lifecycle helpers (hasActiveClaudeSessions, abortAllClaudeSessions,
 * clearPendingApprovals) are consumed by src/main/index.ts and
 * src/main/windows/main.ts to coordinate reload/quit.
 */

/** Active Claude streaming sessions keyed by subChatId. */
export const activeSessions = new Map<string, AbortController>();

/** Pending tool-approval callbacks keyed by toolUseId. */
export const pendingToolApprovals = new Map<
  string,
  {
    subChatId: string;
    resolve: (decision: {
      approved: boolean;
      message?: string;
      updatedInput?: unknown;
    }) => void;
  }
>();

/** Tools blocked in plan mode — Claude must not execute these without exiting plan mode. */
export const PLAN_MODE_BLOCKED_TOOLS = new Set(["Bash", "NotebookEdit"]);

/** Check if there are any active Claude streaming sessions. */
export function hasActiveClaudeSessions(): boolean {
  return activeSessions.size > 0;
}

/** Abort all active Claude sessions so their cleanup saves partial state. */
export function abortAllClaudeSessions(): void {
  for (const [subChatId, controller] of activeSessions) {
    console.log(`[claude] Aborting session ${subChatId} before reload`);
    controller.abort();
  }
  activeSessions.clear();
}

/**
 * Resolve any pending tool approvals with a rejection message.
 * When subChatId is provided, only approvals for that session are cleared.
 */
export function clearPendingApprovals(message: string, subChatId?: string): void {
  for (const [toolUseId, pending] of pendingToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) continue;
    pending.resolve({ approved: false, message });
    pendingToolApprovals.delete(toolUseId);
  }
}
