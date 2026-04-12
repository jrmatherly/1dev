/**
 * Message parser — extracts sub-chat message JSON and normalizes tool parts.
 *
 * Migrated from `mock-api.ts` (Phase 2 of mock-api retirement).
 * The original pipeline spanned lines 50-234 of `mock-api.ts` inside the
 * `api.agents.getAgentChat` adapter. Here it lives as typed helpers that
 * consumers call directly after `trpc.chats.get.useQuery()`.
 *
 * See `openspec/changes/migrate-mock-api-consumers/proposal.md` for context.
 */

import { normalizeCodexToolPart } from "../../shared/codex-tool-normalizer";

type AnyObj = Record<string, any>;

/**
 * Verb-to-tool-type mapping for ACP/codex title-based tool type extraction.
 * Used to decode `"tool-Read README.md"` → `"tool-Read"` with parsed input.
 */
const acpVerbMap: Record<string, string> = {
  Read: "Read",
  Run: "Bash",
  List: "Glob",
  Search: "Grep",
  Grep: "Grep",
  Glob: "Glob",
  Edit: "Edit",
  Write: "Write",
  Thought: "Thinking",
  Fetch: "WebFetch",
};

/**
 * A message part after parsing. We keep this as `AnyObj` because the shape
 * varies across tool types — consumers narrow it at render time.
 */
export type MessagePart = AnyObj;

/**
 * A parsed message with a `parts` array.
 */
export type ParsedMessage = {
  parts?: MessagePart[];
  [key: string]: unknown;
};

/**
 * Parse a JSON-encoded messages string into an array.
 * Returns `[]` on parse failure with a console warning.
 */
export function parseSubChatMessages(
  messagesJson: string | null | undefined,
  subChatId?: string,
): ParsedMessage[] {
  if (!messagesJson) return [];
  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(
      "[message-parser] Failed to parse messages for subChat:",
      subChatId ?? "(unknown)",
    );
    return [];
  }
}

/**
 * Normalize a single message part through all 5 transformation stages:
 * 1. `tool-invocation` → `tool-{toolName}` legacy migration
 * 2. Codex MCP wrapper normalization (`tool-Tool:` prefix)
 * 3. ACP title-based type extraction (e.g., `"tool-Read README.md"` → `"tool-Read"`)
 * 4. Generic `state` field normalization (`result` → `output-available` / `output-error`)
 * 5. Pass-through for unhandled cases
 */
function normalizeMessagePart(part: MessagePart): MessagePart {
  // Stage 1: Migrate old "tool-invocation" type to "tool-{toolName}"
  if (part.type === "tool-invocation" && part.toolName) {
    return {
      ...part,
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId || part.toolInvocationId,
      input: part.input || part.args,
    };
  }

  // Stage 2: Normalize Codex MCP wrapper shape (e.g. tool-Tool: notion/notion-search)
  // to canonical tool-mcp__{server}__{tool} so MCP renderer can parse it.
  if (
    part.type?.startsWith("tool-Tool:") ||
    part.toolName?.startsWith("Tool:") ||
    part.input?.toolName?.startsWith("Tool:")
  ) {
    const normalizedMcpPart = normalizeCodexToolPart(part) as AnyObj;
    if (normalizedMcpPart !== part) {
      if (normalizedMcpPart.state) {
        let normalizedState = normalizedMcpPart.state;
        if (normalizedMcpPart.state === "result") {
          normalizedState =
            normalizedMcpPart.result?.success === false
              ? "output-error"
              : "output-available";
        }
        return {
          ...normalizedMcpPart,
          state: normalizedState,
          output: normalizedMcpPart.output || normalizedMcpPart.result,
        };
      }
      return normalizedMcpPart;
    }
  }

  // Stage 3: Normalize ACP/codex tool types (e.g. "tool-Read README.md" → "tool-Read")
  // Detects ACP parts by: title-based type with space, or proxy tool name, or input.toolName present
  if (
    part.type?.startsWith("tool-") &&
    (part.input?.toolName ||
      part.type.includes(" ") ||
      part.type === "tool-acp.acp_provider_agent_dynamic_tool")
  ) {
    let parsedInput: AnyObj = {};
    if (part.input && typeof part.input === "object") {
      parsedInput = part.input as AnyObj;
    } else if (typeof part.input === "string") {
      try {
        const parsed = JSON.parse(part.input);
        if (parsed && typeof parsed === "object") {
          parsedInput = parsed as AnyObj;
        }
      } catch {
        parsedInput = {};
      }
    }
    const title: string = parsedInput.toolName || part.type.slice(5);
    const args: AnyObj =
      parsedInput.args && typeof parsedInput.args === "object"
        ? parsedInput.args
        : parsedInput;
    const spaceIdx = title.indexOf(" ");
    const verb = spaceIdx === -1 ? title : title.slice(0, spaceIdx);
    const detail = spaceIdx === -1 ? "" : title.slice(spaceIdx + 1);
    const toolType = acpVerbMap[verb];
    if (toolType) {
      const unwrapped: AnyObj = {
        ...part,
        type: `tool-${toolType}`,
        input: {
          ...args,
          _acpTitle: title,
          _acpDetail: detail,
        },
      };
      if (toolType === "Read" && !unwrapped.input.file_path && detail) {
        unwrapped.input.file_path = detail;
      }
      if (toolType === "Bash") {
        if (Array.isArray(unwrapped.input.command)) {
          unwrapped.input.command =
            unwrapped.input.command[unwrapped.input.command.length - 1] ||
            detail;
        } else if (!unwrapped.input.command && detail) {
          unwrapped.input.command = detail;
        }
      }
      if (toolType === "Grep" && !unwrapped.input.pattern && detail) {
        unwrapped.input.pattern = detail;
      }
      if (toolType === "Glob" && !unwrapped.input.pattern && detail) {
        unwrapped.input.pattern = detail;
      }
      // State normalization for ACP-unwrapped parts
      if (unwrapped.state) {
        let normalizedState = unwrapped.state;
        if (unwrapped.state === "result") {
          normalizedState =
            unwrapped.result?.success === false
              ? "output-error"
              : "output-available";
        }
        return {
          ...unwrapped,
          state: normalizedState,
          output: unwrapped.output || unwrapped.result,
        };
      }
      return unwrapped;
    }
  }

  // Stage 4: Generic state normalization from DB format to AI SDK format
  // DB stores: "result", "call" → AI SDK expects: "output-available", "call"
  if (part.type?.startsWith("tool-") && part.state) {
    let normalizedState = part.state;
    if (part.state === "result") {
      normalizedState =
        part.result?.success === false ? "output-error" : "output-available";
    }
    return {
      ...part,
      state: normalizedState,
      output: part.output || part.result,
    };
  }

  // Stage 5: Pass-through
  return part;
}

/**
 * Normalize all message parts in an array of messages.
 */
export function normalizeMessageParts(
  messages: ParsedMessage[],
): ParsedMessage[] {
  return messages.map((msg) => {
    if (!msg.parts) return msg;
    return {
      ...msg,
      parts: msg.parts.map(normalizeMessagePart),
    };
  });
}

/**
 * Combined: parse JSON + normalize all transformation stages.
 */
export function parseAndNormalizeSubChatMessages(
  messagesJson: string | null | undefined,
  subChatId?: string,
): ParsedMessage[] {
  const parsed = parseSubChatMessages(messagesJson, subChatId);
  return normalizeMessageParts(parsed);
}

/**
 * Fields injected by `parseAndNormalizeChat` to preserve mock-api shape
 * compatibility for F9 (Live Preview) boundary code. Desktop uses worktrees,
 * not sandboxes, so `sandbox_id` and `meta` are always null — consumers gate
 * preview UI on these null checks and it evaluates to false on desktop.
 *
 * These fields exist because `agents-content.tsx` and related components
 * inherited their shape from the upstream mock-api. When F9 is fully removed
 * from desktop, these injected fields can be removed.
 */
export type ChatSandboxFields = {
  sandbox_id: string | null;
  meta: any;
};

/**
 * SubChat fields injected by the helper to match mock-api shape.
 */
export type SubChatStreamFields = {
  stream_id: string | null;
  messages: ParsedMessage[];
};

/**
 * Transform a full chat response: apply parsing + normalization to all subChats.
 *
 * Preserves the synthetic `sandbox_id: null`, `meta: null`, and `stream_id: null`
 * fields that the old `mock-api.ts` adapter injected. These keep F9 (Live Preview)
 * gate checks working (they always evaluate to false on desktop since
 * `sandbox_id` is always null — desktop uses worktrees instead).
 *
 * See `.claude/rules/upstream-boundary.md` for the F9 boundary context.
 */
export function parseAndNormalizeChat<T extends AnyObj>(
  chat: T | null | undefined,
):
  | (T & ChatSandboxFields & { subChats?: Array<AnyObj & SubChatStreamFields> })
  | null {
  if (!chat) return null;
  const typedChat = chat as AnyObj;
  const result = {
    ...typedChat,
    // Desktop uses worktrees, not sandboxes (F9 dead on desktop)
    sandbox_id: null as string | null,
    meta: null as Record<string, unknown> | null,
    subChats: typedChat.subChats?.map((sc: AnyObj) => ({
      ...sc,
      messages: parseAndNormalizeSubChatMessages(sc.messages, sc.id),
      stream_id: null as string | null,
    })),
  };
  return result as unknown as T &
    ChatSandboxFields & {
      subChats?: Array<AnyObj & SubChatStreamFields>;
    };
}
