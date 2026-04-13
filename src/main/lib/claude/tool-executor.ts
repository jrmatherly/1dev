/**
 * Tool executor — the `canUseTool` callback handed to `claudeQuery(...)`
 * inside the chat subscription handler.
 *
 * Extracted from claude.ts as part of security-hardening-and-quality-remediation §7.
 * The callback was a ~200-line closure inside a 2019-line chat subscription.
 * To keep the extraction faithful to the original behavior, this module
 * exposes a factory function `createCanUseTool(context)` that returns the
 * callback with access to:
 *   - isUsingOllama (ollama parameter-name normalization)
 *   - mode (plan-mode guardrails)
 *   - subChatId (session correlation for pendingToolApprovals)
 *   - safeEmit (UI emit callback for AskUserQuestion streaming)
 *   - parts (accumulated message parts for AskUserQuestion result tracking)
 *
 * This is a pure behavioral lift — no logic changes. The callback continues
 * to read/write from module-level state owned by session-manager
 * (pendingToolApprovals, PLAN_MODE_BLOCKED_TOOLS).
 */

import {
  PLAN_MODE_BLOCKED_TOOLS,
  pendingToolApprovals,
} from "./session-manager";
import type { UIMessageChunk } from "../claude";

export type CanUseToolResult =
  | { behavior: "allow"; updatedInput: unknown }
  | { behavior: "deny"; message: string };

export interface ToolExecutorContext {
  /** Whether the current backend is Ollama (triggers parameter-name fixes). */
  isUsingOllama: boolean;
  /** Chat mode — "plan" blocks certain tool categories, "agent" is permissive. */
  mode: string | undefined;
  /** Sub-chat identifier, needed to scope pending tool approvals. */
  subChatId: string;
  /** Safe emit callback — no-ops if the observable is already unsubscribed. */
  safeEmit: (chunk: UIMessageChunk) => void;
  /**
   * Accumulated message parts for the current streaming response. The
   * AskUserQuestion handler mutates the matching tool part's `result` and
   * `state` so the UI reflects answers/errors in real time.
   */
  parts: Array<{
    type?: string;
    toolCallId?: string;
    result?: unknown;
    state?: string;
  }>;
}

/**
 * Build the `canUseTool` callback with the per-request context captured.
 */
export function createCanUseTool(ctx: ToolExecutorContext) {
  const { isUsingOllama, mode, subChatId, safeEmit, parts } = ctx;

  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { toolUseID: string },
  ): Promise<CanUseToolResult> => {
    // Fix common parameter mistakes from Ollama models.
    // Local models often use slightly wrong parameter names.
    if (isUsingOllama) {
      // Read: "file" -> "file_path"
      if (
        toolName === "Read" &&
        toolInput.file &&
        !toolInput.file_path
      ) {
        toolInput.file_path = toolInput.file;
        delete toolInput.file;
        console.log("[Ollama] Fixed Read tool: file -> file_path");
      }
      // Write: "file" -> "file_path", "content" is usually correct
      if (
        toolName === "Write" &&
        toolInput.file &&
        !toolInput.file_path
      ) {
        toolInput.file_path = toolInput.file;
        delete toolInput.file;
        console.log("[Ollama] Fixed Write tool: file -> file_path");
      }
      // Edit: "file" -> "file_path"
      if (
        toolName === "Edit" &&
        toolInput.file &&
        !toolInput.file_path
      ) {
        toolInput.file_path = toolInput.file;
        delete toolInput.file;
        console.log("[Ollama] Fixed Edit tool: file -> file_path");
      }
      // Glob: "path" might be passed as "directory" or "dir"
      if (toolName === "Glob") {
        if (toolInput.directory && !toolInput.path) {
          toolInput.path = toolInput.directory;
          delete toolInput.directory;
          console.log("[Ollama] Fixed Glob tool: directory -> path");
        }
        if (toolInput.dir && !toolInput.path) {
          toolInput.path = toolInput.dir;
          delete toolInput.dir;
          console.log("[Ollama] Fixed Glob tool: dir -> path");
        }
      }
      // Grep: "query" -> "pattern", "directory" -> "path"
      if (toolName === "Grep") {
        if (toolInput.query && !toolInput.pattern) {
          toolInput.pattern = toolInput.query;
          delete toolInput.query;
          console.log("[Ollama] Fixed Grep tool: query -> pattern");
        }
        if (toolInput.directory && !toolInput.path) {
          toolInput.path = toolInput.directory;
          delete toolInput.directory;
          console.log("[Ollama] Fixed Grep tool: directory -> path");
        }
      }
      // Bash: "cmd" -> "command"
      if (
        toolName === "Bash" &&
        toolInput.cmd &&
        !toolInput.command
      ) {
        toolInput.command = toolInput.cmd;
        delete toolInput.cmd;
        console.log("[Ollama] Fixed Bash tool: cmd -> command");
      }
    }

    // Plan-mode tool guardrails — restrict side-effecting tools.
    if (mode === "plan") {
      if (toolName === "Edit" || toolName === "Write") {
        const filePath =
          typeof toolInput.file_path === "string"
            ? toolInput.file_path
            : "";
        if (!/\.md$/i.test(filePath)) {
          return {
            behavior: "deny",
            message: 'Only ".md" files can be modified in plan mode.',
          };
        }
      } else if (toolName == "ExitPlanMode") {
        return {
          behavior: "deny",
          message: `IMPORTANT: DONT IMPLEMENT THE PLAN UNTIL THE EXPLIT COMMAND. THE PLAN WAS **ONLY** PRESENTED TO USER, FINISH CURRENT MESSAGE AS SOON AS POSSIBLE`,
        };
      } else if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
        return {
          behavior: "deny",
          message: `Tool "${toolName}" blocked in plan mode.`,
        };
      }
    }

    // AskUserQuestion — interactive approval with 60s timeout.
    if (toolName === "AskUserQuestion") {
      const { toolUseID } = options;
      safeEmit({
        type: "ask-user-question",
        toolUseId: toolUseID,
        questions: (toolInput as Record<string, unknown>).questions,
      } as UIMessageChunk);

      const response = await new Promise<{
        approved: boolean;
        message?: string;
        updatedInput?: unknown;
      }>((resolve) => {
        const timeoutId = setTimeout(() => {
          pendingToolApprovals.delete(toolUseID);
          safeEmit({
            type: "ask-user-question-timeout",
            toolUseId: toolUseID,
          } as UIMessageChunk);
          resolve({ approved: false, message: "Timed out" });
        }, 60000);

        pendingToolApprovals.set(toolUseID, {
          subChatId,
          resolve: (d) => {
            clearTimeout(timeoutId);
            resolve(d);
          },
        });
      });

      const askToolPart = parts.find(
        (p) =>
          p.toolCallId === toolUseID &&
          p.type === "tool-AskUserQuestion",
      );

      if (!response.approved) {
        const errorMessage = response.message || "Skipped";
        if (askToolPart) {
          askToolPart.result = errorMessage;
          askToolPart.state = "result";
        }
        safeEmit({
          type: "ask-user-question-result",
          toolUseId: toolUseID,
          result: errorMessage,
        } as unknown as UIMessageChunk);
        return {
          behavior: "deny",
          message: errorMessage,
        };
      }

      const answers = (
        response.updatedInput as Record<string, unknown> | null
      )?.answers;
      const answerResult = { answers };
      if (askToolPart) {
        askToolPart.result = answerResult;
        askToolPart.state = "result";
      }
      safeEmit({
        type: "ask-user-question-result",
        toolUseId: toolUseID,
        result: answerResult,
      } as unknown as UIMessageChunk);
      return {
        behavior: "allow",
        updatedInput: response.updatedInput,
      };
    }

    return {
      behavior: "allow",
      updatedInput: toolInput,
    };
  };
}
