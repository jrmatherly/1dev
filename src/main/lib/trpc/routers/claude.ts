import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { app, BrowserWindow } from "electron";
import * as fs from "fs/promises";
import * as os from "os";
import path from "path";
import { z } from "zod";
import { setConnectionMethod } from "../../analytics";
import { decryptCredential } from "../../credential-store";
import { safeJsonParse } from "../../safe-json-parse";
import { mcpServerUrlSchema } from "../schemas/mcp-url";
import {
  buildClaudeEnv,
  checkOfflineFallback,
  createTransformer,
  getBundledClaudeBinaryPath,
  logClaudeEnv,
  logRawClaudeMessage,
  type UIMessageChunk,
} from "../../claude";
import {
  deriveClaudeSpawnEnv,
  type ProviderMode,
} from "../../claude/spawn-env";
import { getAuthManager } from "../../../index";
import { parseMentions } from "../../claude/prompt-parser";
import { createCanUseTool } from "../../claude/tool-executor";
import {
  activeSessions,
  pendingToolApprovals,
  clearPendingApprovals,
} from "../../claude/session-manager";
import {
  workingMcpServers,
  symlinksCreated,
  mcpConfigCache,
  projectMcpJsonCache,
  mcpCacheKey,
  readProjectMcpJsonCached,
  clearMcpResolverCaches,
  getServerStatusFromConfig,
  getAllMcpConfigHandler,
} from "../../claude/mcp-resolver";

// Re-export public API so existing importers (index.ts, windows/main.ts,
// anthropic-accounts.ts) continue to resolve them from "./claude" without
// touching those files.
export {
  hasActiveClaudeSessions,
  abortAllClaudeSessions,
} from "../../claude/session-manager";
export {
  workingMcpServers,
  getAllMcpConfigHandler,
} from "../../claude/mcp-resolver";
import {
  getMergedGlobalMcpServers,
  getMergedLocalProjectMcpServers,
  readClaudeConfig,
  readClaudeDirConfig,
  removeMcpServerConfig,
  resolveProjectPathFromWorktree,
  updateMcpServerConfig,
  writeClaudeConfig,
  type ClaudeConfig,
  type McpServerConfig,
} from "../../claude-config";
import {
  anthropicAccounts,
  anthropicSettings,
  chats,
  claudeCodeCredentials,
  getDatabase,
  subChats,
} from "../../db";
import { createRollbackStash } from "../../git/stash";
import {
  ensureMcpTokensFresh,
  getMcpAuthStatus,
  startMcpOAuth,
} from "../../mcp-auth";

import { discoverPluginMcpServers } from "../../plugins";
import { publicProcedure, router } from "../index";
import { buildAgentsOption } from "./agent-utils";
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "./claude-settings";

/**
 * Get Claude Code OAuth token from local SQLite
 * Uses multi-account system first (active account), falls back to legacy table
 * Returns null if not connected
 */
function getClaudeCodeToken(): string | null {
  try {
    const db = getDatabase();

    console.log("[claude-auth] ========== CLAUDE CODE AUTH DEBUG ==========");

    // First try multi-account system
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get();

    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get();

      // When the active account is BYOK, return null immediately — do NOT
      // fall through to the legacy `claudeCodeCredentials` table. The legacy
      // table may still hold an encrypted OAuth token from a prior
      // subscription flow, which would leak into the BYOK spawn and mix
      // two distinct auth contexts. This is the exact bug class
      // add-dual-mode-llm-routing exists to prevent.
      //
      // See openspec/specs/claude-code-auth-import/spec.md — "Requirement:
      // getClaudeCodeToken returns null when active account is BYOK".
      if (account && account.accountType === "byok") {
        console.log(
          "[claude-auth] Active account is BYOK — returning null without legacy fallback",
        );
        return null;
      }

      if (account?.oauthToken) {
        console.log(
          "[claude-auth] Using multi-account system, activeAccountId:",
          settings.activeAccountId,
        );
        const decrypted = decryptCredential(account.oauthToken);
        console.log("[claude-auth] Token decrypted successfully");
        return decrypted;
      }

      console.log(
        "[claude-auth] Active account not found or has no token, falling back to legacy",
      );
    }

    // Fallback to legacy table
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get();

    console.log(
      "[claude-auth] Legacy credential record:",
      cred
        ? {
            id: cred.id,
            hasOauthToken: !!cred.oauthToken,
            encryptedTokenLength: cred.oauthToken?.length ?? 0,
            connectedAt: cred.connectedAt,
            userId: cred.userId,
          }
        : null,
    );

    if (!cred?.oauthToken) {
      console.log("[claude-auth] No Claude Code credentials found");
      console.log("[claude-auth] ============================================");
      return null;
    }

    const decrypted = decryptCredential(cred.oauthToken);
    console.log("[claude-auth] Token decrypted successfully (legacy)");

    return decrypted;
  } catch (error) {
    console.error("[claude-auth] Error getting Claude Code token:", error);
    return null;
  }
}

/**
 * Resolve the active anthropicAccounts row into a typed ProviderMode the
 * pure `deriveClaudeSpawnEnv` function can consume. Returns null when
 * there is no qualifying account (e.g., first run, Ollama-only session,
 * or a row that predates the dual-mode-llm-routing migration).
 *
 * Falls through to the legacy inference path in claude.ts:start when null.
 * See openspec/changes/add-dual-mode-llm-routing/ for the full contract.
 */
export function getActiveProviderMode(): ProviderMode | null {
  try {
    const db = getDatabase();
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get();
    if (!settings?.activeAccountId) return null;

    const account = db
      .select()
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.id, settings.activeAccountId))
      .get();
    if (!account) return null;

    // Entra oid for x-litellm-customer-id audit attribution. Present only
    // when enterprise auth is active; undefined otherwise.
    const authManager = getAuthManager();
    const customerId = authManager?.getUser()?.id ?? undefined;

    // Defensive decrypt helper — returns null on failure so we can fall
    // back to the legacy path rather than crashing the chat stream.
    const tryDecrypt = (enc: string | null | undefined): string | null => {
      if (!enc) return null;
      try {
        return decryptCredential(enc);
      } catch (err) {
        console.error(
          "[claude-auth] Failed to decrypt credential column:",
          err,
        );
        return null;
      }
    };

    const oauthToken = tryDecrypt(account.oauthToken);
    const apiKey = tryDecrypt(account.apiKey);
    const virtualKey = tryDecrypt(account.virtualKey);

    if (account.accountType === "claude-subscription") {
      if (!oauthToken) return null;
      if (account.routingMode === "direct") {
        return { kind: "subscription-direct", oauthToken };
      }
      if (!virtualKey) return null; // subscription-litellm requires a virtual key
      return {
        kind: "subscription-litellm",
        oauthToken,
        virtualKey,
        customerId,
      };
    }

    if (account.accountType === "byok") {
      if (account.routingMode === "direct") {
        if (!apiKey) return null;
        return { kind: "byok-direct", apiKey };
      }
      if (!virtualKey) return null;
      const modelMap = {
        sonnet: account.modelSonnet ?? "",
        haiku: account.modelHaiku ?? "",
        opus: account.modelOpus ?? "",
      };
      if (!modelMap.sonnet || !modelMap.haiku || !modelMap.opus) return null;
      return { kind: "byok-litellm", virtualKey, customerId, modelMap };
    }

    return null;
  } catch (error) {
    console.error("[claude-auth] getActiveProviderMode failed:", error);
    return null;
  }
}

// Dynamic import for ESM module - CACHED to avoid re-importing on every message
let cachedClaudeQuery:
  | typeof import("@anthropic-ai/claude-agent-sdk").query
  | null = null;
const getClaudeQuery = async () => {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery;
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  cachedClaudeQuery = sdk.query;
  return cachedClaudeQuery;
};


// Image attachment schema
const imageAttachmentSchema = z.object({
  base64Data: z.string(),
  mediaType: z.string(), // e.g. "image/png", "image/jpeg"
  filename: z.string().optional(),
});

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;

/**
 * Clear all performance caches (for testing/debugging). Facade over per-module
 * clear functions so external callers (anthropic-accounts.ts) keep a single
 * entry point.
 */
export function clearClaudeCaches() {
  cachedClaudeQuery = null;
  clearMcpResolverCaches();
  console.log("[claude] All caches cleared");
}


export const claudeRouter = router({
  /**
   * Stream chat with Claude - single subscription handles everything
   */
  chat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        prompt: z.string(),
        cwd: z.string(),
        projectPath: z.string().optional(), // Original project path for MCP config lookup
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        customConfig: z
          .object({
            model: z.string().min(1),
            token: z.string().min(1),
            baseUrl: z.string().min(1),
          })
          .optional(),
        maxThinkingTokens: z.number().optional(), // Enable extended thinking
        images: z.array(imageAttachmentSchema).optional(), // Image attachments
        historyEnabled: z.boolean().optional(),
        offlineModeEnabled: z.boolean().optional(), // Whether offline mode (Ollama) is enabled in settings
        enableTasks: z.boolean().optional(), // Enable task management tools (TodoWrite, Task agents)
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        // Abort any existing session for this subChatId before starting a new one
        // This prevents race conditions if two messages are sent in quick succession
        const existingController = activeSessions.get(input.subChatId);
        if (existingController) {
          existingController.abort();
        }

        const abortController = new AbortController();
        const streamId = crypto.randomUUID();
        activeSessions.set(input.subChatId, abortController);

        // Stream debug logging
        const subId = input.subChatId.slice(-8); // Short ID for logs
        const streamStart = Date.now();
        let chunkCount = 0;
        let lastChunkType = "";
        // Shared sessionId for cleanup to save on abort
        let currentSessionId: string | null = null;
        console.log(
          `[SD] M:START sub=${subId} stream=${streamId.slice(-8)} mode=${input.mode}`,
        );

        // Track if observable is still active (not unsubscribed)
        let isObservableActive = true;

        // Helper to safely emit (no-op if already unsubscribed)
        const safeEmit = (chunk: UIMessageChunk) => {
          if (!isObservableActive) return false;
          try {
            emit.next(chunk);
            return true;
          } catch {
            isObservableActive = false;
            return false;
          }
        };

        // Helper to safely complete (no-op if already closed)
        const safeComplete = () => {
          try {
            emit.complete();
          } catch {
            // Already completed or closed
          }
        };

        // Helper to emit error to frontend
        const emitError = (error: unknown, context: string) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;

          console.error(`[claude] ${context}:`, errorMessage);
          if (errorStack) console.error("[claude] Stack:", errorStack);

          // Send detailed error to frontend (safely)
          safeEmit({
            type: "error",
            errorText: `${context}: ${errorMessage}`,
            // Include extra debug info
            ...(process.env.NODE_ENV !== "production" && {
              debugInfo: {
                context,
                cwd: input.cwd,
                mode: input.mode,
                PATH: process.env.PATH?.slice(0, 200),
              },
            }),
          } as UIMessageChunk);
        };

        (async () => {
          try {
            const db = getDatabase();

            // 1. Get existing messages from DB
            const existing = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get();
            const existingMessages =
              safeJsonParse<any[]>(existing?.messages) ?? [];
            const existingSessionId = existing?.sessionId || null;

            // Get resumeSessionAt UUID only if shouldResume flag was set (by rollbackToMessage)
            // or shouldForkResume flag was set (by forkSubChat)
            const lastAssistantMsg = [...existingMessages]
              .reverse()
              .find((m: any) => m.role === "assistant");
            const resumeAtUuid = lastAssistantMsg?.metadata?.shouldResume
              ? lastAssistantMsg?.metadata?.sdkMessageUuid || null
              : null;
            const shouldForkResume =
              lastAssistantMsg?.metadata?.shouldForkResume === true;
            const forkResumeAtUuid = shouldForkResume
              ? lastAssistantMsg?.metadata?.sdkMessageUuid || null
              : null;
            const historyEnabled = input.historyEnabled === true;

            // Clear shouldForkResume flag after reading (consumed once) and persist to DB
            if (shouldForkResume) {
              for (const m of existingMessages) {
                if (m.metadata?.shouldForkResume) {
                  delete m.metadata.shouldForkResume;
                }
              }
              db.update(subChats)
                .set({ messages: JSON.stringify(existingMessages) })
                .where(eq(subChats.id, input.subChatId))
                .run();
            }

            // Check if last message is already this user message (avoid duplicate)
            const lastMsg = existingMessages.at(-1);
            const lastMsgText = lastMsg?.parts?.find(
              (p: any) => p.type === "text",
            )?.text;
            const isDuplicate =
              lastMsg?.role === "user" && lastMsgText === input.prompt;

            // 2. Create user message and save BEFORE streaming (skip if duplicate)
            let messagesToSave: any[];

            if (isDuplicate) {
              messagesToSave = existingMessages;
            } else {
              const parts: any[] = [{ type: "text", text: input.prompt }];
              if (input.images && input.images.length > 0) {
                for (const img of input.images) {
                  parts.push({
                    type: "data-image",
                    data: {
                      base64Data: img.base64Data,
                      mediaType: img.mediaType,
                      filename: img.filename,
                    },
                  });
                }
              }
              const userMessage = {
                id: crypto.randomUUID(),
                role: "user",
                parts,
              };
              messagesToSave = [...existingMessages, userMessage];

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messagesToSave),
                  streamId,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run();
            }

            // 2.5. AUTO-FALLBACK: Check internet and switch to Ollama if offline
            // Only check if offline mode is enabled in settings
            const claudeCodeToken = getClaudeCodeToken();
            const offlineResult = await checkOfflineFallback(
              input.customConfig,
              claudeCodeToken,
              undefined, // selectedOllamaModel - will be read from customConfig if present
              input.offlineModeEnabled ?? false, // Pass offline mode setting
            );

            if (offlineResult.error) {
              emitError(
                new Error(offlineResult.error),
                "Offline mode unavailable",
              );
              safeEmit({ type: "finish" } as UIMessageChunk);
              safeComplete();
              return;
            }

            // Use offline config if available
            const finalCustomConfig =
              offlineResult.config || input.customConfig;
            const isUsingOllama = offlineResult.isUsingOllama;

            // Track connection method for analytics
            let connectionMethod = "claude-subscription"; // default (Claude Code OAuth)
            if (isUsingOllama) {
              connectionMethod = "offline-ollama";
            } else if (finalCustomConfig) {
              // Has custom config = either API key or custom model
              const isDefaultAnthropicUrl =
                !finalCustomConfig.baseUrl ||
                (() => {
                  try {
                    const h = new URL(finalCustomConfig.baseUrl!).hostname;
                    return (
                      h === "anthropic.com" || h.endsWith(".anthropic.com")
                    );
                  } catch {
                    return false;
                  }
                })();
              connectionMethod = isDefaultAnthropicUrl
                ? "api-key"
                : "custom-model";
            }
            setConnectionMethod(connectionMethod);

            // Offline status is shown in sidebar, no need to emit message here
            // (emitting text-delta without text-start breaks UI text rendering)

            // 3. Get Claude SDK
            let claudeQuery;
            try {
              claudeQuery = await getClaudeQuery();
            } catch (sdkError) {
              emitError(sdkError, "Failed to load Claude SDK");
              console.log(
                `[SD] M:END sub=${subId} reason=sdk_load_error n=${chunkCount}`,
              );
              safeEmit({ type: "finish" } as UIMessageChunk);
              safeComplete();
              return;
            }

            const transform = createTransformer({
              isUsingOllama,
            });

            // 4. Setup accumulation state
            const parts: any[] = [];
            let currentText = "";
            let metadata: any = {};

            // Capture stderr from Claude process for debugging
            const stderrLines: string[] = [];

            // Parse mentions from prompt (agents, skills, files, folders)
            const { cleanedPrompt, agentMentions, skillMentions } =
              parseMentions(input.prompt);

            // Build agents option for SDK (proper registration via options.agents)
            const agentsOption = await buildAgentsOption(
              agentMentions,
              input.cwd,
            );

            // Log if agents were mentioned
            if (agentMentions.length > 0) {
              console.log(
                `[claude] Registering agents via SDK:`,
                Object.keys(agentsOption),
              );
            }

            // Log if skills were mentioned
            if (skillMentions.length > 0) {
              console.log(`[claude] Skills mentioned:`, skillMentions);
            }

            // Build final prompt with skill instructions if needed
            let finalPrompt = cleanedPrompt;

            // Handle empty prompt when only mentions are present
            if (!finalPrompt.trim()) {
              if (agentMentions.length > 0 && skillMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) and invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`;
              } else if (agentMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) for this task.`;
              } else if (skillMentions.length > 0) {
                finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`;
              }
            } else if (skillMentions.length > 0) {
              // Append skill instruction to existing prompt
              finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`;
            }

            // Build prompt: if there are images, create an AsyncIterable<SDKUserMessage>
            // Otherwise use simple string prompt
            let prompt: string | AsyncIterable<any> = finalPrompt;

            if (input.images && input.images.length > 0) {
              // Create message content array with images first, then text
              const messageContent: any[] = [
                ...input.images.map((img) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mediaType,
                    data: img.base64Data,
                  },
                })),
              ];

              // Add text if present
              if (finalPrompt.trim()) {
                messageContent.push({
                  type: "text" as const,
                  text: finalPrompt,
                });
              }

              // Create an async generator that yields a single SDKUserMessage
              async function* createPromptWithImages() {
                yield {
                  type: "user" as const,
                  message: {
                    role: "user" as const,
                    content: messageContent,
                  },
                  parent_tool_use_id: null,
                };
              }

              prompt = createPromptWithImages();
            }

            // Build full environment for Claude SDK (includes HOME, PATH, etc.)
            const claudeEnv = await buildClaudeEnv({
              ...(finalCustomConfig && {
                customEnv: {
                  ANTHROPIC_AUTH_TOKEN: finalCustomConfig.token,
                  ANTHROPIC_BASE_URL: finalCustomConfig.baseUrl,
                },
              }),
              enableTasks: input.enableTasks ?? true,
            });

            // Debug logging in dev
            if (process.env.NODE_ENV !== "production") {
              logClaudeEnv(claudeEnv, `[${input.subChatId}] `);
            }

            // Create isolated config directory per subChat to prevent session contamination
            // The Claude binary stores sessions in ~/.claude/ based on cwd, which causes
            // cross-chat contamination when multiple chats use the same project folder
            // For Ollama: use chatId instead of subChatId so all messages in the same chat share history
            const isolatedConfigDir = path.join(
              app.getPath("userData"),
              "claude-sessions",
              isUsingOllama ? input.chatId : input.subChatId,
            );

            // MCP servers to pass to SDK (read from ~/.claude.json)
            let mcpServersForSdk: Record<string, any> | undefined;

            // Ensure isolated config dir exists and symlink selected ~/.claude/ assets
            // This is needed because SDK looks for these under $CLAUDE_CONFIG_DIR/
            // OPTIMIZATION: Only create symlinks once per subChatId (cached)
            try {
              await fs.mkdir(isolatedConfigDir, { recursive: true });

              // Only create symlinks if not already created for this config dir
              const cacheKey = isUsingOllama ? input.chatId : input.subChatId;
              if (!symlinksCreated.has(cacheKey)) {
                const homeClaudeDir = path.join(os.homedir(), ".claude");
                const symlinkType =
                  process.platform === "win32" ? "junction" : "dir";

                const skillsSource = path.join(homeClaudeDir, "skills");
                const skillsTarget = path.join(isolatedConfigDir, "skills");
                const commandsSource = path.join(homeClaudeDir, "commands");
                const commandsTarget = path.join(isolatedConfigDir, "commands");
                const agentsSource = path.join(homeClaudeDir, "agents");
                const agentsTarget = path.join(isolatedConfigDir, "agents");
                const pluginsSource = path.join(homeClaudeDir, "plugins");
                const pluginsTarget = path.join(isolatedConfigDir, "plugins");
                const settingsSource = path.join(
                  homeClaudeDir,
                  "settings.json",
                );
                const settingsTarget = path.join(
                  isolatedConfigDir,
                  "settings.json",
                );

                let symlinkSetupComplete = true;
                let symlinkSetupHadErrors = false;

                const ensureSymlink = async (
                  sourcePath: string,
                  targetPath: string,
                  label: string,
                  targetKind: "dir" | "file",
                ) => {
                  try {
                    const sourceExists = await fs
                      .stat(sourcePath)
                      .then(() => true)
                      .catch(() => false);
                    const targetExists = await fs
                      .lstat(targetPath)
                      .then(() => true)
                      .catch(() => false);

                    if (sourceExists && !targetExists) {
                      if (targetKind === "dir") {
                        await fs.symlink(sourcePath, targetPath, symlinkType);
                      } else {
                        await fs.symlink(sourcePath, targetPath);
                      }
                    }

                    // Keep rechecking on next request when source is not created yet.
                    if (!sourceExists && !targetExists) {
                      symlinkSetupComplete = false;
                    }
                  } catch (symlinkErr) {
                    symlinkSetupComplete = false;
                    symlinkSetupHadErrors = true;
                    console.warn(
                      `[claude] Failed to symlink ${label}:`,
                      (symlinkErr as Error).message,
                    );
                  }
                };

                await ensureSymlink(
                  skillsSource,
                  skillsTarget,
                  "skills directory",
                  "dir",
                );
                await ensureSymlink(
                  commandsSource,
                  commandsTarget,
                  "commands directory",
                  "dir",
                );
                await ensureSymlink(
                  agentsSource,
                  agentsTarget,
                  "agents directory",
                  "dir",
                );
                await ensureSymlink(
                  pluginsSource,
                  pluginsTarget,
                  "plugins directory",
                  "dir",
                );
                await ensureSymlink(
                  settingsSource,
                  settingsTarget,
                  "settings.json",
                  "file",
                );

                if (symlinkSetupComplete) {
                  symlinksCreated.add(cacheKey);
                } else if (symlinkSetupHadErrors) {
                  console.warn(
                    "[claude] Symlink setup incomplete, will retry on next request",
                  );
                }
              }

              // Read MCP servers from all sources for the original project path
              // These will be passed directly to the SDK via options.mcpServers
              // Sources: ~/.claude.json, ~/.claude/.claude.json, ~/.claude/mcp.json, .mcp.json
              // OPTIMIZATION: Cache configs by file mtime to avoid re-parsing on every message
              const claudeJsonSource = path.join(os.homedir(), ".claude.json");
              try {
                const stats = await fs.stat(claudeJsonSource).catch(() => null);
                const currentMtime = stats?.mtimeMs ?? 0;
                const cached = mcpConfigCache.get(claudeJsonSource);
                const lookupPath = input.projectPath || input.cwd;

                // Get or refresh cached config
                let claudeConfig: any;
                if (
                  cached?.mtime === currentMtime &&
                  currentMtime > 0
                ) {
                  claudeConfig = cached.config;
                } else if (stats) {
                  claudeConfig = JSON.parse(
                    await fs.readFile(claudeJsonSource, "utf-8"),
                  );
                  mcpConfigCache.set(claudeJsonSource, {
                    config: claudeConfig,
                    mtime: currentMtime,
                  });
                } else {
                  claudeConfig = {};
                }

                // Read ~/.claude/.claude.json once for reuse
                let chatClaudeDirConfig: ClaudeConfig = {};
                try {
                  chatClaudeDirConfig = await readClaudeDirConfig();
                } catch {
                  /* ignore */
                }

                // Merge global servers from all user-level sources
                const globalServers = await getMergedGlobalMcpServers(
                  claudeConfig,
                  chatClaudeDirConfig,
                );

                // Merge per-project servers from config files
                const projectConfigServers =
                  await getMergedLocalProjectMcpServers(
                    lookupPath,
                    claudeConfig,
                    chatClaudeDirConfig,
                  );

                // Read .mcp.json from project root (with mtime caching)
                const projectMcpJsonServers =
                  await readProjectMcpJsonCached(lookupPath);

                // Per-project config servers override .mcp.json
                const projectServers = {
                  ...projectMcpJsonServers,
                  ...projectConfigServers,
                };

                // Load plugin MCP servers (filtered by enabled plugins and approval)
                const [
                  enabledPluginSources,
                  pluginMcpConfigs,
                  approvedServers,
                ] = await Promise.all([
                  getEnabledPlugins(),
                  discoverPluginMcpServers(),
                  getApprovedPluginMcpServers(),
                ]);

                const pluginServers: Record<string, McpServerConfig> = {};
                for (const pConfig of pluginMcpConfigs) {
                  if (enabledPluginSources.includes(pConfig.pluginSource)) {
                    for (const [name, serverConfig] of Object.entries(
                      pConfig.mcpServers,
                    )) {
                      if (!globalServers[name] && !projectServers[name]) {
                        const identifier = `${pConfig.pluginSource}:${name}`;
                        if (approvedServers.includes(identifier)) {
                          pluginServers[name] = serverConfig;
                        }
                      }
                    }
                  }
                }

                // Priority: project > global > plugin
                const allServers = {
                  ...pluginServers,
                  ...globalServers,
                  ...projectServers,
                };

                // Filter to only working MCPs using scoped cache keys
                if (workingMcpServers.size > 0) {
                  const filtered: Record<string, any> = {};
                  // Resolve worktree path to original project path to match cache keys
                  const resolvedProjectPath =
                    resolveProjectPathFromWorktree(lookupPath) || lookupPath;
                  for (const [name, srvConfig] of Object.entries(allServers)) {
                    // Use resolved project scope if server is from project, otherwise global
                    const scope =
                      name in projectServers ? resolvedProjectPath : null;
                    const cacheKey = mcpCacheKey(scope, name);
                    // Include server if it's marked working, or if it's not in cache at all
                    // (plugin servers won't be in the cache yet)
                    if (
                      workingMcpServers.get(cacheKey) === true ||
                      !workingMcpServers.has(cacheKey)
                    ) {
                      filtered[name] = srvConfig;
                    }
                  }
                  mcpServersForSdk = filtered;
                  const skipped =
                    Object.keys(allServers).length -
                    Object.keys(filtered).length;
                  if (skipped > 0) {
                    console.log(
                      `[claude] Filtered out ${skipped} non-working MCP(s)`,
                    );
                  }
                } else {
                  mcpServersForSdk = allServers;
                }
              } catch (configErr) {
                console.error(`[claude] Failed to read MCP config:`, configErr);
              }
            } catch (mkdirErr) {
              console.error(
                `[claude] Failed to setup isolated config dir:`,
                mkdirErr,
              );
            }

            // Resolve the account-backed ProviderMode for Claude Code Subscription
            // and future anthropicAccounts-backed BYOK sessions. Ollama and legacy
            // Jotai-atom BYOK keep their existing inference path (see roadmap
            // entry "Migrate Ollama + legacy Jotai BYOK into deriveClaudeSpawnEnv"
            // scheduled for a follow-up change).
            const providerMode = finalCustomConfig
              ? null
              : getActiveProviderMode();
            const liteLlmBaseUrl = process.env.MAIN_VITE_LITELLM_BASE_URL;

            let derivedEnv: Record<string, string> | null = null;
            if (providerMode) {
              try {
                derivedEnv = deriveClaudeSpawnEnv(providerMode, liteLlmBaseUrl);
                console.log(
                  `[claude-auth] Using deriveClaudeSpawnEnv (kind=${providerMode.kind})`,
                );
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : String(err);
                console.error(
                  `[claude-auth] deriveClaudeSpawnEnv threw: ${message}`,
                );
                emitError(
                  new Error(message),
                  "LLM routing configuration error",
                );
                safeEmit({ type: "finish" } as UIMessageChunk);
                safeComplete();
                return;
              }
            }

            // Legacy inference path — kept for Ollama and Jotai-atom BYOK.
            // Will be retired when the roadmap follow-up migrates those paths.
            const hasExistingApiConfig = !!(
              claudeEnv.ANTHROPIC_API_KEY ||
              claudeEnv.ANTHROPIC_AUTH_TOKEN ||
              claudeEnv.ANTHROPIC_BASE_URL
            );

            if (hasExistingApiConfig && !derivedEnv) {
              console.log(
                `[claude] Using existing CLI config - API_KEY: ${claudeEnv.ANTHROPIC_API_KEY ? "set" : "not set"}, BASE_URL: ${claudeEnv.ANTHROPIC_BASE_URL || "default"}`,
              );
            }

            // Build final env. Precedence:
            //   1. derivedEnv (authoritative for anthropicAccounts-backed sessions)
            //   2. claudeEnv + legacy CLAUDE_CODE_OAUTH_TOKEN fallback (Ollama / Jotai BYOK)
            const finalEnv: Record<string, string | undefined> = derivedEnv
              ? {
                  ...claudeEnv,
                  // Clear any pre-existing auth env vars to avoid conflicts — the
                  // derived set is the ONLY source of truth for this spawn.
                  ANTHROPIC_AUTH_TOKEN: undefined,
                  ANTHROPIC_API_KEY: undefined,
                  ANTHROPIC_BASE_URL: undefined,
                  ANTHROPIC_CUSTOM_HEADERS: undefined,
                  CLAUDE_CODE_OAUTH_TOKEN: undefined,
                  ...derivedEnv,
                  CLAUDE_CONFIG_DIR: isolatedConfigDir,
                }
              : {
                  ...claudeEnv,
                  ...(claudeCodeToken &&
                    !hasExistingApiConfig && {
                      CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
                    }),
                  CLAUDE_CONFIG_DIR: isolatedConfigDir,
                };

            // Log auth method being used
            console.log("[claude-auth] ========== AUTH METHOD USED ==========");
            console.log(
              "[claude-auth] hasExistingApiConfig:",
              hasExistingApiConfig,
            );
            console.log(
              "[claude-auth] claudeCodeToken available:",
              !!claudeCodeToken,
            );
            console.log(
              "[claude-auth] Using CLAUDE_CODE_OAUTH_TOKEN:",
              !!finalEnv.CLAUDE_CODE_OAUTH_TOKEN,
            );
            console.log(
              "[claude-auth] Using ANTHROPIC_API_KEY:",
              !!finalEnv.ANTHROPIC_API_KEY,
            );
            console.log(
              "[claude-auth] Using ANTHROPIC_BASE_URL:",
              finalEnv.ANTHROPIC_BASE_URL || "(default)",
            );
            console.log(
              "[claude-auth] Using ANTHROPIC_AUTH_TOKEN:",
              !!finalEnv.ANTHROPIC_AUTH_TOKEN,
            );
            console.log(
              "[claude-auth] ============================================",
            );

            // Get bundled Claude binary path
            const claudeBinaryPath = getBundledClaudeBinaryPath();

            const resumeSessionId =
              input.sessionId || existingSessionId || undefined;

            // DEBUG: Session resume path tracing
            const expectedSanitizedCwd = input.cwd.replace(/[/.]/g, "-");
            const expectedSessionPath = path.join(
              isolatedConfigDir,
              "projects",
              expectedSanitizedCwd,
              `${resumeSessionId}.jsonl`,
            );
            console.log(`[claude] ========== SESSION DEBUG ==========`);
            console.log(`[claude] subChatId: ${input.subChatId}`);
            console.log(`[claude] cwd: ${input.cwd}`);
            console.log(
              `[claude] sanitized cwd (expected): ${expectedSanitizedCwd}`,
            );
            console.log(`[claude] CLAUDE_CONFIG_DIR: ${isolatedConfigDir}`);
            console.log(
              `[claude] Expected session path: ${expectedSessionPath}`,
            );
            console.log(`[claude] Session ID to resume: ${resumeSessionId}`);
            console.log(
              `[claude] Existing sessionId from DB: ${existingSessionId}`,
            );
            console.log(`[claude] Resume at UUID: ${resumeAtUuid}`);
            console.log(
              `[claude] Fork resume: ${shouldForkResume}, fork UUID: ${forkResumeAtUuid}`,
            );
            console.log(`[claude] ========== END SESSION DEBUG ==========`);

            console.log(
              `[SD] Query options - cwd: ${input.cwd}, projectPath: ${input.projectPath || "(not set)"}, mcpServers: ${mcpServersForSdk ? Object.keys(mcpServersForSdk).join(", ") : "(none)"}`,
            );
            if (finalCustomConfig) {
              // Strip token entirely from logged config — no preview, no length.
              // Phase 0 hard gate #5 (strategy v2.1 §6).
              const { token: _redactedToken, ...redactedConfig } =
                finalCustomConfig;
              void _redactedToken;
              if (isUsingOllama) {
                console.log(
                  `[Ollama] Using offline mode - Model: ${finalCustomConfig.model}, Base URL: ${finalCustomConfig.baseUrl}`,
                );
              } else {
                console.log(
                  `[claude] Custom config: ${JSON.stringify(redactedConfig)}`,
                );
              }
            }

            const resolvedModel = finalCustomConfig?.model || input.model;

            // DEBUG: If using Ollama, test if it's actually responding
            if (isUsingOllama && finalCustomConfig) {
              console.log("[Ollama Debug] Testing Ollama connectivity...");
              try {
                const testResponse = await fetch(
                  `${finalCustomConfig.baseUrl}/api/tags`,
                  {
                    signal: AbortSignal.timeout(2000),
                  },
                );
                if (testResponse.ok) {
                  const data = await testResponse.json();
                  const models = data.models?.map((m: any) => m.name) || [];
                  console.log(
                    "[Ollama Debug] Ollama is responding. Available models:",
                    models,
                  );

                  if (!models.includes(finalCustomConfig.model)) {
                    console.error(
                      `[Ollama Debug] WARNING: Model "${finalCustomConfig.model}" not found in Ollama!`,
                    );
                    console.error(`[Ollama Debug] Available models:`, models);
                    console.error(
                      `[Ollama Debug] This will likely cause the stream to hang or fail silently.`,
                    );
                  } else {
                    console.log(
                      `[Ollama Debug] ✓ Model "${finalCustomConfig.model}" is available`,
                    );
                  }
                } else {
                  console.error(
                    "[Ollama Debug] Ollama returned error:",
                    testResponse.status,
                  );
                }
              } catch (err) {
                console.error(
                  "[Ollama Debug] Failed to connect to Ollama:",
                  err,
                );
              }
            }

            // Skip MCP servers entirely in offline mode (Ollama) - they slow down initialization by 60+ seconds
            // Otherwise pass all MCP servers - the SDK will handle connection
            let mcpServersFiltered: Record<string, any> | undefined;

            if (isUsingOllama) {
              console.log(
                "[Ollama] Skipping MCP servers to speed up initialization",
              );
              mcpServersFiltered = undefined;
            } else if (
              mcpServersForSdk &&
              Object.keys(mcpServersForSdk).length > 0
            ) {
              // Ensure MCP tokens are fresh (refresh if within 5 min of expiry)
              const lookupPath = input.projectPath || input.cwd;
              mcpServersFiltered = await ensureMcpTokensFresh(
                mcpServersForSdk,
                lookupPath,
              );
            } else {
              mcpServersFiltered = mcpServersForSdk;
            }

            // Log SDK configuration for debugging
            if (isUsingOllama) {
              console.log("[Ollama Debug] SDK Configuration:", {
                model: resolvedModel,
                baseUrl: finalEnv.ANTHROPIC_BASE_URL,
                cwd: input.cwd,
                configDir: isolatedConfigDir,
                hasAuthToken: !!finalEnv.ANTHROPIC_AUTH_TOKEN,
              });
              console.log("[Ollama Debug] Session settings:", {
                resumeSessionId: resumeSessionId || "none (first message)",
                mode: resumeSessionId ? "resume" : "continue",
                note: resumeSessionId
                  ? "Resuming existing session to maintain chat history"
                  : "Starting new session with continue mode",
              });
            }

            // Read AGENTS.md from project root if it exists
            let agentsMdContent: string | undefined;
            try {
              const agentsMdPath = path.join(input.cwd, "AGENTS.md");
              agentsMdContent = await fs.readFile(agentsMdPath, "utf-8");
              if (agentsMdContent.trim()) {
                console.log(
                  `[claude] Found AGENTS.md at ${agentsMdPath} (${agentsMdContent.length} chars)`,
                );
              } else {
                agentsMdContent = undefined;
              }
            } catch {
              // AGENTS.md doesn't exist or can't be read - that's fine
            }

            // For Ollama: embed context AND history directly in prompt
            // Ollama doesn't have server-side sessions, so we must include full history
            let finalQueryPrompt: string | AsyncIterable<any> = prompt;
            if (isUsingOllama && typeof prompt === "string") {
              // Format conversation history from existingMessages (excluding current message)
              // IMPORTANT: Include tool calls info so model knows what files were read/edited
              let historyText = "";
              if (existingMessages.length > 0) {
                const historyParts: string[] = [];
                for (const msg of existingMessages) {
                  if (msg.role === "user") {
                    // Extract text from user message parts
                    const textParts =
                      msg.parts
                        ?.filter((p: any) => p.type === "text")
                        .map((p: any) => p.text) || [];
                    if (textParts.length > 0) {
                      historyParts.push(`User: ${textParts.join("\n")}`);
                    }
                  } else if (msg.role === "assistant") {
                    // Extract text AND tool calls from assistant message parts
                    const parts = msg.parts || [];
                    const textParts: string[] = [];
                    const toolSummaries: string[] = [];

                    for (const p of parts) {
                      if (p.type === "text" && p.text) {
                        textParts.push(p.text);
                      } else if (
                        p.type === "tool_use" ||
                        p.type === "tool-use"
                      ) {
                        // Include brief tool call info - this is critical for context!
                        const toolName = p.name || p.tool || "unknown";
                        const toolInput = p.input || {};
                        // Extract key info based on tool type
                        let toolInfo = `[Used ${toolName}`;
                        if (
                          toolName === "Read" &&
                          (toolInput.file_path || toolInput.file)
                        ) {
                          toolInfo += `: ${toolInput.file_path || toolInput.file}`;
                        } else if (toolName === "Edit" && toolInput.file_path) {
                          toolInfo += `: ${toolInput.file_path}`;
                        } else if (
                          toolName === "Write" &&
                          toolInput.file_path
                        ) {
                          toolInfo += `: ${toolInput.file_path}`;
                        } else if (toolName === "Glob" && toolInput.pattern) {
                          toolInfo += `: ${toolInput.pattern}`;
                        } else if (toolName === "Grep" && toolInput.pattern) {
                          toolInfo += `: "${toolInput.pattern}"`;
                        } else if (toolName === "Bash" && toolInput.command) {
                          const cmd = String(toolInput.command).slice(0, 50);
                          toolInfo += `: ${cmd}${toolInput.command.length > 50 ? "..." : ""}`;
                        }
                        toolInfo += "]";
                        toolSummaries.push(toolInfo);
                      }
                    }

                    // Combine text and tool summaries
                    let assistantContent = "";
                    if (textParts.length > 0) {
                      assistantContent = textParts.join("\n");
                    }
                    if (toolSummaries.length > 0) {
                      if (assistantContent) {
                        assistantContent += "\n" + toolSummaries.join(" ");
                      } else {
                        assistantContent = toolSummaries.join(" ");
                      }
                    }
                    if (assistantContent) {
                      historyParts.push(`Assistant: ${assistantContent}`);
                    }
                  }
                }
                if (historyParts.length > 0) {
                  // Limit history to last ~10000 chars to avoid context overflow
                  let history = historyParts.join("\n\n");
                  if (history.length > 10000) {
                    history =
                      "...(earlier messages truncated)...\n\n" +
                      history.slice(-10000);
                  }
                  historyText = `[CONVERSATION HISTORY]
${history}
[/CONVERSATION HISTORY]

`;
                  console.log(
                    `[Ollama] Added ${historyParts.length} messages to history (${history.length} chars)`,
                  );
                }
              }

              const ollamaContext = `[CONTEXT]
You are a coding assistant in OFFLINE mode (Ollama model: ${resolvedModel || "unknown"}).
Project: ${input.projectPath || input.cwd}
Working directory: ${input.cwd}

IMPORTANT: When using tools, use these EXACT parameter names:
- Read: use "file_path" (not "file")
- Write: use "file_path" and "content"
- Edit: use "file_path", "old_string", "new_string"
- Glob: use "pattern" (e.g. "**/*.ts") and optionally "path"
- Grep: use "pattern" and optionally "path"
- Bash: use "command"

When asked about the project, use Glob to find files and Read to examine them.
Be concise and helpful.
[/CONTEXT]${
                agentsMdContent
                  ? `

[AGENTS.MD]
${agentsMdContent}
[/AGENTS.MD]`
                  : ""
              }

${historyText}[CURRENT REQUEST]
${prompt}
[/CURRENT REQUEST]`;
              finalQueryPrompt = ollamaContext;
              console.log("[Ollama] Context prefix added to prompt");
            }

            // System prompt config - use preset for both Claude and Ollama
            // If AGENTS.md exists, append its content to the system prompt
            const systemPromptConfig = agentsMdContent
              ? {
                  type: "preset" as const,
                  preset: "claude_code" as const,
                  append: `\n\n# AGENTS.md\nThe following are the project's AGENTS.md instructions:\n\n${agentsMdContent}`,
                }
              : {
                  type: "preset" as const,
                  preset: "claude_code" as const,
                };

            const queryOptions = {
              prompt: finalQueryPrompt,
              options: {
                abortController, // Must be inside options!
                cwd: input.cwd,
                systemPrompt: systemPromptConfig,
                // Register mentioned agents with SDK via options.agents (skip for Ollama - not supported)
                ...(!isUsingOllama &&
                  Object.keys(agentsOption).length > 0 && {
                    agents: agentsOption,
                  }),
                // Pass filtered MCP servers (only working/unknown ones, skip failed/needs-auth)
                ...(mcpServersFiltered &&
                  Object.keys(mcpServersFiltered).length > 0 && {
                    mcpServers: mcpServersFiltered,
                  }),
                env: finalEnv,
                permissionMode:
                  input.mode === "plan"
                    ? ("plan" as const)
                    : ("bypassPermissions" as const),
                ...(input.mode !== "plan" && {
                  allowDangerouslySkipPermissions: true,
                }),
                includePartialMessages: true,
                // Load skills from project and user directories (skip for Ollama - not supported)
                ...(!isUsingOllama && {
                  settingSources: ["project" as const, "user" as const],
                }),
                canUseTool: createCanUseTool({
                  isUsingOllama,
                  mode: input.mode,
                  subChatId: input.subChatId,
                  safeEmit,
                  parts,
                }),
                stderr: (data: string) => {
                  stderrLines.push(data);
                  if (isUsingOllama) {
                    console.error("[Ollama stderr]", data);
                  } else {
                    console.error("[claude stderr]", data);
                  }
                },
                // Use bundled binary
                pathToClaudeCodeExecutable: claudeBinaryPath,
                // Session handling: For Ollama, use resume with session ID to maintain history
                // For Claude API, use resume with rollback/fork support
                ...(resumeSessionId && {
                  resume: resumeSessionId,
                  // Fork support - resume at specific point and create new session
                  ...(shouldForkResume && forkResumeAtUuid && !isUsingOllama
                    ? {
                        resumeSessionAt: forkResumeAtUuid,
                        forkSession: true,
                      }
                    : // Rollback support - resume at specific message UUID (from DB)
                      resumeAtUuid && !isUsingOllama
                      ? { resumeSessionAt: resumeAtUuid }
                      : { continue: true }),
                }),
                // For first message in chat (no session ID yet), use continue mode
                ...(!resumeSessionId && { continue: true }),
                ...(resolvedModel && { model: resolvedModel }),
                // fallbackModel: "claude-opus-4-5-20251101",
                ...(input.maxThinkingTokens && {
                  maxThinkingTokens: input.maxThinkingTokens,
                }),
              },
            };

            // Auto-retry for transient API errors (e.g., false-positive USAGE_POLICY_VIOLATION)
            const MAX_POLICY_RETRIES = 2;
            let policyRetryCount = 0;
            let policyRetryNeeded = false;
            let messageCount = 0;
            let pendingFinishChunk: UIMessageChunk | null = null;

            while (true) {
              policyRetryNeeded = false;
              messageCount = 0;
              pendingFinishChunk = null;

              // 5. Run Claude SDK
              let stream;
              try {
                // @ts-expect-error — SDK Options type requires literal 'deny'|'allow' for canUseTool behavior, but our implementation returns string
                stream = claudeQuery(queryOptions);
              } catch (queryError) {
                console.error(
                  "[CLAUDE] ✗ Failed to create SDK query:",
                  queryError,
                );
                emitError(queryError, "Failed to start Claude query");
                console.log(
                  `[SD] M:END sub=${subId} reason=query_error n=${chunkCount}`,
                );
                safeEmit({ type: "finish" } as UIMessageChunk);
                safeComplete();
                return;
              }

              let lastError: Error | null = null;
              let firstMessageReceived = false;
              // Track last assistant message UUID for rollback support
              // Only assigned to metadata AFTER the stream completes (not during generation)
              let lastAssistantUuid: string | null = null;
              const streamIterationStart = Date.now();

              // Plan mode: track ExitPlanMode to stop after plan is complete
              let exitPlanModeToolCallId: string | null = null;

              if (isUsingOllama) {
                console.log(`[Ollama] ===== STARTING STREAM ITERATION =====`);
                console.log(`[Ollama] Model: ${finalCustomConfig?.model}`);
                console.log(
                  `[Ollama] Base URL configured: ${finalCustomConfig?.baseUrl ? "yes" : "no"}`,
                );
                console.log(
                  `[Ollama] Prompt: "${typeof input.prompt === "string" ? input.prompt.slice(0, 100) : "N/A"}..."`,
                );
                console.log(`[Ollama] CWD: ${input.cwd}`);
              }

              try {
                for await (const msg of stream) {
                  if (abortController.signal.aborted) {
                    if (isUsingOllama)
                      console.log(`[Ollama] Stream aborted by user`);
                    break;
                  }

                  messageCount++;

                  // Extra logging for Ollama to diagnose issues
                  if (isUsingOllama) {
                    // SDK streaming payload — union of many shapes, not worth
                    // fully typing for diagnostic logging only.
                    const msgAnyPreview = msg as any;
                    console.log(
                      `[Ollama] ===== MESSAGE #${messageCount} =====`,
                    );
                    console.log(`[Ollama] Type: ${msgAnyPreview.type}`);
                    console.log(
                      `[Ollama] Subtype: ${msgAnyPreview.subtype || "none"}`,
                    );
                    if (msgAnyPreview.event) {
                      console.log(
                        `[Ollama] Event: ${msgAnyPreview.event.type}`,
                        {
                          delta_type: msgAnyPreview.event.delta?.type,
                          content_block_type:
                            msgAnyPreview.event.content_block?.type,
                        },
                      );
                    }
                    if (msgAnyPreview.message?.content) {
                      console.log(
                        `[Ollama] Message content blocks:`,
                        msgAnyPreview.message.content.length,
                      );
                      msgAnyPreview.message.content.forEach(
                        (block: any, idx: number) => {
                          console.log(
                            `[Ollama]   Block ${idx}: type=${block.type}, text_length=${block.text?.length || 0}`,
                          );
                        },
                      );
                    }
                  }

                  // Warn if SDK initialization is slow (MCP delay)
                  if (!firstMessageReceived) {
                    firstMessageReceived = true;
                    const timeToFirstMessage =
                      Date.now() - streamIterationStart;
                    if (isUsingOllama) {
                      console.log(
                        `[Ollama] Time to first message: ${timeToFirstMessage}ms`,
                      );
                    }
                    if (timeToFirstMessage > 5000) {
                      console.warn(
                        `[claude] SDK initialization took ${(timeToFirstMessage / 1000).toFixed(1)}s (MCP servers loading?)`,
                      );
                    }
                  }

                  // Log raw message for debugging
                  logRawClaudeMessage(input.chatId, msg);

                  // Check for error messages from SDK (error can be embedded in message payload!)
                  // SDK emits a union of message variants whose published types
                  // don't expose the runtime `error` field shape.
                  const msgAny = msg as any;
                  if (msgAny.type === "error" || msgAny.error) {
                    // Extract detailed error text from message content if available
                    // This is where the actual error description lives (e.g., "API Error: Claude Code is unable to respond...")
                    const messageText = msgAny.message?.content?.[0]?.text;
                    const sdkError =
                      messageText ||
                      msgAny.error ||
                      msgAny.message ||
                      "Unknown SDK error";
                    lastError = new Error(sdkError); // NOSONAR — placeholder for future error propagation

                    // Detailed SDK error logging in main process
                    console.error(
                      `[CLAUDE SDK ERROR] ========================================`,
                    );
                    console.error(`[CLAUDE SDK ERROR] Raw error: ${sdkError}`);
                    console.error(
                      `[CLAUDE SDK ERROR] Message type: ${msgAny.type}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] SubChat ID: ${input.subChatId}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] Chat ID: ${input.chatId}`,
                    );
                    console.error(`[CLAUDE SDK ERROR] CWD: ${input.cwd}`);
                    console.error(`[CLAUDE SDK ERROR] Mode: ${input.mode}`);
                    console.error(
                      `[CLAUDE SDK ERROR] Session ID: ${msgAny.session_id || "none"}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] Has custom config: ${!!finalCustomConfig}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] Is using Ollama: ${isUsingOllama}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] Model: ${resolvedModel || "default"}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] Has OAuth token: ${!!claudeCodeToken}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] MCP servers: ${mcpServersFiltered ? Object.keys(mcpServersFiltered).join(", ") : "none"}`,
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] Full message:`,
                      JSON.stringify(msgAny, null, 2),
                    );
                    console.error(
                      `[CLAUDE SDK ERROR] ========================================`,
                    );

                    // Categorize SDK-level errors
                    // Use the raw error code (e.g., "invalid_request") for category matching
                    const rawErrorCode = msgAny.error || "";
                    let errorCategory = "SDK_ERROR";
                    // Default errorContext to the full error text (which may include detailed message)
                    let errorContext = sdkError;

                    if (
                      rawErrorCode === "authentication_failed" ||
                      sdkError.includes("authentication")
                    ) {
                      // Show OAuth reconnect only when OAuth auth is actually in use.
                      // If API-key auth is active, treat as API auth failure instead.
                      const isApiKeyAuthMode = Boolean(
                        finalCustomConfig || hasExistingApiConfig,
                      );
                      if (isApiKeyAuthMode) {
                        errorCategory = "AUTH_FAILURE";
                        errorContext =
                          "Authentication failed - check your API key";
                      } else {
                        errorCategory = "AUTH_FAILED_SDK";
                        errorContext =
                          "Authentication failed - not logged into Claude Code CLI";
                      }
                    } else if (
                      String(sdkError).includes("invalid_token") ||
                      String(sdkError).includes("Invalid access token")
                    ) {
                      errorCategory = "MCP_INVALID_TOKEN";
                      errorContext =
                        "Invalid access token. Update MCP settings";
                    } else if (
                      rawErrorCode === "invalid_api_key" ||
                      sdkError.includes("api_key")
                    ) {
                      errorCategory = "INVALID_API_KEY_SDK";
                      errorContext = sdkError;
                    } else if (
                      rawErrorCode === "rate_limit_exceeded" ||
                      sdkError.includes("rate")
                    ) {
                      errorCategory = "RATE_LIMIT_SDK";
                      errorContext = "Session limit reached";
                    } else if (
                      rawErrorCode === "overloaded" ||
                      sdkError.includes("overload")
                    ) {
                      errorCategory = "OVERLOADED_SDK";
                      errorContext = "Claude is overloaded, try again later";
                    } else if (
                      rawErrorCode === "invalid_request" ||
                      sdkError.includes("Usage Policy") ||
                      sdkError.includes("violate")
                    ) {
                      errorCategory = "USAGE_POLICY_VIOLATION";
                    }

                    // Auto-retry on false-positive policy violations (gateway-level rejections)
                    if (
                      errorCategory === "USAGE_POLICY_VIOLATION" &&
                      policyRetryCount < MAX_POLICY_RETRIES &&
                      !abortController.signal.aborted
                    ) {
                      policyRetryCount++;
                      policyRetryNeeded = true;
                      console.log(
                        `[claude] USAGE_POLICY_VIOLATION - silent retry (attempt ${policyRetryCount}/${MAX_POLICY_RETRIES})`,
                      );
                      break; // break for-await loop to retry
                    }

                    // Emit auth-error for authentication failures, regular error otherwise
                    if (errorCategory === "AUTH_FAILED_SDK") {
                      safeEmit({
                        type: "auth-error",
                        errorText: errorContext,
                      } as UIMessageChunk);
                    } else {
                      safeEmit({
                        type: "error",
                        errorText: errorContext,
                        debugInfo: {
                          category: errorCategory,
                          rawErrorCode,
                          sessionId: msgAny.session_id,
                          messageId: msgAny.message?.id,
                        },
                      } as UIMessageChunk);
                    }

                    console.log(
                      `[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`,
                    );
                    console.error(`[SD] SDK Error details:`, {
                      errorCategory,
                      errorContext: errorContext.slice(0, 200), // Truncate for log readability
                      rawErrorCode,
                      sessionId: msgAny.session_id,
                      messageId: msgAny.message?.id,
                      fullMessage: JSON.stringify(msgAny, null, 2),
                    });
                    safeEmit({ type: "finish" } as UIMessageChunk);
                    safeComplete();
                    return;
                  }

                  // Track sessionId for rollback support (available on all messages)
                  if (msgAny.session_id) {
                    metadata.sessionId = msgAny.session_id;
                    currentSessionId = msgAny.session_id; // Share with cleanup
                  }

                  // Track UUID from assistant messages for resumeSessionAt
                  if (msgAny.type === "assistant" && msgAny.uuid) {
                    lastAssistantUuid = msgAny.uuid;
                  }

                  // When result arrives, assign the last assistant UUID to metadata
                  // It will be emitted as part of the merged message-metadata chunk below
                  if (
                    msgAny.type === "result" &&
                    historyEnabled &&
                    lastAssistantUuid &&
                    !abortController.signal.aborted
                  ) {
                    metadata.sdkMessageUuid = lastAssistantUuid;
                  }

                  // Debug: Log system messages from SDK
                  if (msgAny.type === "system") {
                    // Full log to see all fields including MCP errors
                    console.log(
                      `[SD] SYSTEM message: subtype=${msgAny.subtype}`,
                      JSON.stringify(
                        {
                          cwd: msgAny.cwd,
                          mcp_servers: msgAny.mcp_servers,
                          tools: msgAny.tools,
                          plugins: msgAny.plugins,
                          permissionMode: msgAny.permissionMode,
                        },
                        null,
                        2,
                      ),
                    );
                  }

                  // Transform and emit + accumulate
                  for (const chunk of transform(msg)) {
                    chunkCount++;
                    lastChunkType = chunk.type;

                    // For message-metadata, inject sdkMessageUuid before emitting
                    // so the frontend receives the full merged metadata in one chunk
                    if (
                      chunk.type === "message-metadata" &&
                      metadata.sdkMessageUuid
                    ) {
                      chunk.messageMetadata = {
                        ...chunk.messageMetadata,
                        sdkMessageUuid: metadata.sdkMessageUuid,
                      };
                    }

                    // IMPORTANT: Defer the protocol "finish" chunk until after DB persistence.
                    // If we emit finish early, the UI can send the next user message before
                    // this assistant message is written, and the next save overwrites it.
                    if (chunk.type === "finish") {
                      pendingFinishChunk = chunk;
                      continue;
                    }

                    // Use safeEmit to prevent throws when observer is closed
                    if (!safeEmit(chunk)) {
                      // Observer closed (user clicked Stop), break out of loop
                      console.log(
                        `[SD] M:EMIT_CLOSED sub=${subId} type=${chunk.type} n=${chunkCount}`,
                      );
                      break;
                    }

                    // Accumulate based on chunk type
                    switch (chunk.type) {
                      case "text-delta":
                        currentText += chunk.delta;
                        break;
                      case "text-end":
                        if (currentText.trim()) {
                          parts.push({ type: "text", text: currentText });
                          currentText = "";
                        }
                        break;
                      case "tool-input-available":
                        // DEBUG: Log tool calls
                        console.log(
                          `[SD] M:TOOL_CALL sub=${subId} toolName="${chunk.toolName}" mode=${input.mode} callId=${chunk.toolCallId}`,
                        );

                        // Track ExitPlanMode toolCallId so we can stop when it completes
                        if (
                          input.mode === "plan" &&
                          chunk.toolName === "ExitPlanMode"
                        ) {
                          console.log(
                            `[SD] M:PLAN_TOOL_DETECTED sub=${subId} callId=${chunk.toolCallId}`,
                          );
                          exitPlanModeToolCallId = chunk.toolCallId; // NOSONAR — placeholder for plan-mode exit tracking
                        }

                        parts.push({
                          type: `tool-${chunk.toolName}`,
                          toolCallId: chunk.toolCallId,
                          toolName: chunk.toolName,
                          input: chunk.input,
                          state: "call",
                          startedAt: Date.now(),
                        });
                        break;
                      case "tool-output-available": {
                        const toolPart = parts.find(
                          (p) =>
                            p.type?.startsWith("tool-") &&
                            p.toolCallId === chunk.toolCallId,
                        );
                        if (toolPart) {
                          toolPart.result = chunk.output;
                          toolPart.output = chunk.output; // Backwards compatibility for the UI that relies on output field
                          toolPart.state = "result";

                          // Notify renderer about file changes for Write/Edit tools
                          if (
                            toolPart.type === "tool-Write" ||
                            toolPart.type === "tool-Edit"
                          ) {
                            const filePath = toolPart.input?.file_path;
                            if (filePath) {
                              const windows = BrowserWindow.getAllWindows();
                              for (const win of windows) {
                                win.webContents.send("file-changed", {
                                  filePath,
                                  type: toolPart.type,
                                  subChatId: input.subChatId,
                                });
                              }
                            }
                          }
                        }
                        break;
                      }
                      case "message-metadata":
                        metadata = { ...metadata, ...chunk.messageMetadata };
                        break;
                    }
                  }
                  // Break from stream loop if observer closed (user clicked Stop)
                  if (!isObservableActive) {
                    console.log(`[SD] M:OBSERVER_CLOSED_STREAM sub=${subId}`);
                    break;
                  }
                }

                // Warn if stream yielded no messages (offline mode issue)
                const streamDuration = Date.now() - streamIterationStart;
                if (isUsingOllama) {
                  console.log(`[Ollama] ===== STREAM COMPLETED =====`);
                  console.log(`[Ollama] Total messages: ${messageCount}`);
                  console.log(`[Ollama] Duration: ${streamDuration}ms`);
                  console.log(`[Ollama] Chunks emitted: ${chunkCount}`);
                }

                if (messageCount === 0) {
                  console.error(
                    `[claude] Stream yielded no messages - model not responding`,
                  );
                  if (isUsingOllama) {
                    console.error(`[Ollama] ===== DIAGNOSIS =====`);
                    console.error(
                      `[Ollama] Problem: Stream completed but NO messages received from SDK`,
                    );
                    console.error(`[Ollama] This usually means:`);
                    console.error(
                      `[Ollama]   1. Ollama doesn't support Anthropic Messages API format (/v1/messages)`,
                    );
                    console.error(
                      `[Ollama]   2. Model failed to start generating (check Ollama logs: ollama logs)`,
                    );
                    console.error(
                      `[Ollama]   3. Network issue between Claude SDK and Ollama`,
                    );
                    console.error(`[Ollama] ===== NEXT STEPS =====`);
                    console.error(
                      `[Ollama]   1. Check if model works: curl http://localhost:11434/api/generate -d '{"model":"${finalCustomConfig?.model}","prompt":"test"}'`,
                    );
                    console.error(
                      `[Ollama]   2. Check Ollama version supports Messages API`,
                    );
                    console.error(
                      `[Ollama]   3. Try using a proxy that converts Anthropic API → Ollama format`,
                    );
                  }
                } else if (messageCount === 1 && isUsingOllama) {
                  console.warn(
                    `[Ollama] Only received 1 message (likely just init). No actual content generated.`,
                  );
                }
              } catch (streamError) {
                // This catches errors during streaming (like process exit)
                const err = streamError as Error;
                const stderrOutput = stderrLines.join("\n");

                if (isUsingOllama) {
                  console.error(`[Ollama] ===== STREAM ERROR =====`);
                  console.error(`[Ollama] Error message: ${err.message}`);
                  console.error(`[Ollama] Error stack:`, err.stack);
                  console.error(
                    `[Ollama] Messages received before error: ${messageCount}`,
                  );
                  if (stderrOutput) {
                    console.error(
                      `[Ollama] Claude binary stderr:`,
                      stderrOutput,
                    );
                  }
                }

                // Build detailed error message with category
                let errorContext = "Claude streaming error";
                let errorCategory = "UNKNOWN";

                // Check for session-not-found error in stderr
                const isSessionNotFound = stderrOutput?.includes(
                  "No conversation found with session ID",
                );

                if (isSessionNotFound) {
                  // Clear the invalid session ID from database so next attempt starts fresh
                  console.log(
                    `[claude] Session not found - clearing invalid sessionId from database`,
                  );
                  db.update(subChats)
                    .set({ sessionId: null })
                    .where(eq(subChats.id, input.subChatId))
                    .run();

                  errorContext = "Previous session expired. Please try again.";
                  errorCategory = "SESSION_EXPIRED";
                } else if (err.message?.includes("exited with code")) {
                  errorContext = "Claude Code process crashed";
                  errorCategory = "PROCESS_CRASH";
                } else if (err.message?.includes("ENOENT")) {
                  errorContext = "Required executable not found in PATH";
                  errorCategory = "EXECUTABLE_NOT_FOUND";
                } else if (
                  err.message?.includes("authentication") ||
                  err.message?.includes("401")
                ) {
                  errorContext = "Authentication failed - check your API key";
                  errorCategory = "AUTH_FAILURE";
                } else if (
                  err.message?.includes("invalid_api_key") ||
                  err.message?.includes("Invalid API Key") ||
                  stderrOutput?.includes("invalid_api_key")
                ) {
                  errorContext = "Invalid API key";
                  errorCategory = "INVALID_API_KEY";
                } else if (
                  err.message?.includes("rate_limit") ||
                  err.message?.includes("429")
                ) {
                  errorContext = "Session limit reached";
                  errorCategory = "RATE_LIMIT";
                } else if (
                  err.message?.includes("network") ||
                  err.message?.includes("ECONNREFUSED") ||
                  err.message?.includes("fetch failed")
                ) {
                  errorContext = "Network error - check your connection";
                  errorCategory = "NETWORK_ERROR";
                }

                // Track error in Sentry (only if app is ready and Sentry is available)
                if (app.isReady() && app.isPackaged) {
                  try {
                    const Sentry = await import("@sentry/electron/main");
                    Sentry.captureException(err, {
                      tags: {
                        errorCategory,
                        mode: input.mode,
                      },
                      extra: {
                        context: errorContext,
                        cwd: input.cwd,
                        stderr: stderrOutput || "(no stderr captured)",
                        chatId: input.chatId,
                        subChatId: input.subChatId,
                      },
                    });
                  } catch {
                    // Sentry not available or failed to import - ignore
                  }
                }

                // Send error with stderr output to frontend (only if not aborted by user)
                if (!abortController.signal.aborted) {
                  safeEmit({
                    type: "error",
                    errorText: stderrOutput
                      ? `${errorContext}: ${err.message}\n\nProcess output:\n${stderrOutput}`
                      : `${errorContext}: ${err.message}`,
                    debugInfo: {
                      context: errorContext,
                      category: errorCategory,
                      cwd: input.cwd,
                      mode: input.mode,
                      stderr: stderrOutput || "(no stderr captured)",
                    },
                  } as UIMessageChunk);
                }

                // ALWAYS save accumulated parts before returning (even on abort/error)
                console.log(
                  `[SD] M:CATCH_SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`,
                );
                if (currentText.trim()) {
                  parts.push({ type: "text", text: currentText });
                }
                if (parts.length > 0) {
                  const assistantMessage = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    parts,
                    metadata,
                  };
                  const finalMessages = [...messagesToSave, assistantMessage];
                  db.update(subChats)
                    .set({
                      messages: JSON.stringify(finalMessages),
                      sessionId: metadata.sessionId,
                      streamId: null,
                      updatedAt: new Date(),
                    })
                    .where(eq(subChats.id, input.subChatId))
                    .run();
                  db.update(chats)
                    .set({ updatedAt: new Date() })
                    .where(eq(chats.id, input.chatId))
                    .run();

                  // Create snapshot stash for rollback support (on error)
                  if (historyEnabled && metadata.sdkMessageUuid && input.cwd) {
                    await createRollbackStash(
                      input.cwd,
                      metadata.sdkMessageUuid,
                    );
                  }
                }

                console.log(
                  `[SD] M:END sub=${subId} reason=stream_error cat=${errorCategory} n=${chunkCount} last=${lastChunkType}`,
                );
                safeEmit({ type: "finish" } as UIMessageChunk);
                safeComplete();
                return;
              }

              // Retry if policy violation detected (transient false positive)
              // Escalating delay: 3s first retry, 6s second retry
              if (policyRetryNeeded) {
                const delayMs = policyRetryCount <= 1 ? 3000 : 6000;
                console.log(
                  `[claude] Policy retry ${policyRetryCount}/${MAX_POLICY_RETRIES} - waiting ${delayMs / 1000}s`,
                );
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                continue;
              }
              break;
            } // end policyRetryLoop

            // 6. Check if we got any response
            if (messageCount === 0 && !abortController.signal.aborted) {
              emitError(
                new Error("No response received from Claude"),
                "Empty response",
              );
              console.log(
                `[SD] M:END sub=${subId} reason=no_response n=${chunkCount}`,
              );
              safeEmit({ type: "finish" } as UIMessageChunk);
              safeComplete();
              return;
            }

            // 7. Save final messages to DB
            // ALWAYS save accumulated parts, even on abort (so user sees partial responses after reload)
            console.log(
              `[SD] M:SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`,
            );

            // Flush any remaining text
            if (currentText.trim()) {
              parts.push({ type: "text", text: currentText });
            }

            const savedSessionId = metadata.sessionId;

            if (parts.length > 0) {
              const assistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                parts,
                metadata,
              };

              const finalMessages = [...messagesToSave, assistantMessage];

              db.update(subChats)
                .set({
                  messages: JSON.stringify(finalMessages),
                  sessionId: savedSessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run();
            } else {
              // No assistant response - just clear streamId
              db.update(subChats)
                .set({
                  sessionId: savedSessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run();
            }

            // Update parent chat timestamp
            db.update(chats)
              .set({ updatedAt: new Date() })
              .where(eq(chats.id, input.chatId))
              .run();

            // Create snapshot stash for rollback support
            if (historyEnabled && metadata.sdkMessageUuid && input.cwd) {
              await createRollbackStash(input.cwd, metadata.sdkMessageUuid);
            }

            const duration = ((Date.now() - streamStart) / 1000).toFixed(1);
            console.log(
              `[SD] M:END sub=${subId} reason=ok n=${chunkCount} last=${lastChunkType} t=${duration}s`,
            );
            if (pendingFinishChunk) {
              safeEmit(pendingFinishChunk);
            } else {
              // Keep protocol invariant for consumers that wait for finish.
              safeEmit({ type: "finish" } as UIMessageChunk);
            }
            safeComplete();
          } catch (error) {
            const duration = ((Date.now() - streamStart) / 1000).toFixed(1);
            console.log(
              `[SD] M:END sub=${subId} reason=unexpected_error n=${chunkCount} t=${duration}s`,
            );
            emitError(error, "Unexpected error");
            safeEmit({ type: "finish" } as UIMessageChunk);
            safeComplete();
          } finally {
            activeSessions.delete(input.subChatId);
          }
        })();

        // Cleanup on unsubscribe
        return () => {
          console.log(
            `[SD] M:CLEANUP sub=${subId} sessionId=${currentSessionId || "none"}`,
          );
          isObservableActive = false; // Prevent emit after unsubscribe
          abortController.abort();
          activeSessions.delete(input.subChatId);
          clearPendingApprovals("Session ended.", input.subChatId);

          // Clear streamId since we're no longer streaming.
          // sessionId is NOT saved here — the save block in the async function
          // handles it (saves on normal completion, clears on abort). This avoids
          // a redundant DB write that the cancel mutation would then overwrite.
          const db = getDatabase();
          db.update(subChats)
            .set({ streamId: null })
            .where(eq(subChats.id, input.subChatId))
            .run();
        };
      });
    }),

  /**
   * Get MCP servers configuration for a project
   * This allows showing MCP servers in UI before starting a chat session
   * NOTE: Does NOT fetch OAuth metadata here - that's done lazily when user clicks Auth
   */
  getMcpConfig: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      try {
        const config = await readClaudeConfig();
        const dirConfig = await readClaudeDirConfig();

        // Merged global servers from all user-level sources
        const globalServers = await getMergedGlobalMcpServers(
          config,
          dirConfig,
        );

        // Per-project servers from config files
        const projectConfigServers = await getMergedLocalProjectMcpServers(
          input.projectPath,
          config,
          dirConfig,
        );

        // .mcp.json from project root
        const projectMcpJsonServers = await readProjectMcpJsonCached(
          input.projectPath,
        );

        // Merge: project config > .mcp.json > global
        const merged = {
          ...globalServers,
          ...projectMcpJsonServers,
          ...projectConfigServers,
        };

        // Add plugin MCP servers (enabled + approved only)
        const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
          await Promise.all([
            getEnabledPlugins(),
            discoverPluginMcpServers(),
            getApprovedPluginMcpServers(),
          ]);

        for (const pluginConfig of pluginMcpConfigs) {
          if (!enabledPluginSources.includes(pluginConfig.pluginSource))
            continue;
          for (const [name, serverConfig] of Object.entries(
            pluginConfig.mcpServers,
          )) {
            if (!merged[name]) {
              const identifier = `${pluginConfig.pluginSource}:${name}`;
              if (approvedServers.includes(identifier)) {
                merged[name] = serverConfig;
              }
            }
          }
        }

        // Convert to array format - determine status from config (no caching)
        const mcpServers = Object.entries(merged).map(
          ([name, serverConfig]) => {
            const configObj = serverConfig as Record<string, unknown>;
            const status = getServerStatusFromConfig(configObj);
            const hasUrl = !!configObj.url;

            return {
              name,
              status,
              config: { ...configObj, _hasUrl: hasUrl },
            };
          },
        );

        return { mcpServers, projectPath: input.projectPath };
      } catch (error) {
        console.error("[getMcpConfig] Error reading config:", error);
        return {
          mcpServers: [],
          projectPath: input.projectPath,
          error: String(error),
        };
      }
    }),

  /**
   * Get ALL MCP servers configuration (global + all projects)
   * Returns grouped data for display in settings
   * Also populates the workingMcpServers cache
   */
  getAllMcpConfig: publicProcedure.query(getAllMcpConfigHandler),

  refreshMcpConfig: publicProcedure.mutation(() => {
    workingMcpServers.clear();
    mcpConfigCache.clear();
    projectMcpJsonCache.clear();
    return { success: true };
  }),

  /**
   * Cancel active session
   */
  cancel: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const controller = activeSessions.get(input.subChatId);
      if (controller) {
        controller.abort();
        activeSessions.delete(input.subChatId);
        clearPendingApprovals("Session cancelled.", input.subChatId);
      }

      return { cancelled: !!controller };
    }),

  /**
   * Check if session is active
   */
  isActive: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => activeSessions.has(input.subChatId)),
  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      }),
    )
    .mutation(({ input }) => {
      const pending = pendingToolApprovals.get(input.toolUseId);
      if (!pending) {
        return { ok: false };
      }
      pending.resolve({
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      });
      pendingToolApprovals.delete(input.toolUseId);
      return { ok: true };
    }),

  /**
   * Start MCP OAuth flow for a server
   * Fetches OAuth metadata internally when needed
   */
  startMcpOAuth: publicProcedure
    .input(
      z.object({
        serverName: z.string(),
        projectPath: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return startMcpOAuth(input.serverName, input.projectPath);
    }),

  /**
   * Get MCP auth status for a server
   */
  getMcpAuthStatus: publicProcedure
    .input(
      z.object({
        serverName: z.string(),
        projectPath: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return getMcpAuthStatus(input.serverName, input.projectPath);
    }),

  addMcpServer: publicProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1)
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            "Name must contain only letters, numbers, underscores, and hyphens",
          ),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        transport: z.enum(["stdio", "http"]),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        url: mcpServerUrlSchema.optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        bearerToken: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const serverName = input.name.trim();

      if (input.transport === "stdio" && !input.command?.trim()) {
        throw new Error("Command is required for stdio servers");
      }
      if (input.transport === "http" && !input.url?.trim()) {
        throw new Error("URL is required for HTTP servers");
      }
      if (input.scope === "project" && !input.projectPath) {
        throw new Error("Project path required for project-scoped servers");
      }

      const serverConfig: McpServerConfig = {};
      if (input.transport === "stdio") {
        serverConfig.command = input.command!.trim();
        if (input.args && input.args.length > 0) {
          serverConfig.args = input.args;
        }
        if (input.env && Object.keys(input.env).length > 0) {
          serverConfig.env = input.env;
        }
      } else {
        serverConfig.url = input.url!.trim();
        if (input.authType) {
          serverConfig.authType = input.authType;
        }
        if (input.bearerToken) {
          serverConfig.headers = {
            Authorization: `Bearer ${input.bearerToken}`,
          };
        }
      }

      // Check existence before writing
      const existingConfig = await readClaudeConfig();
      const projectPath = input.projectPath;
      if (input.scope === "project" && projectPath) {
        if (existingConfig.projects?.[projectPath]?.mcpServers?.[serverName]) {
          throw new Error(
            `Server "${serverName}" already exists in this project`,
          );
        }
      } else if (existingConfig.mcpServers?.[serverName]) {
        throw new Error(`Server "${serverName}" already exists`);
      }

      const config = updateMcpServerConfig(
        existingConfig,
        input.scope === "project" ? (projectPath ?? null) : null,
        serverName,
        serverConfig,
      );
      await writeClaudeConfig(config);

      return { success: true, name: serverName };
    }),

  updateMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        newName: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        url: mcpServerUrlSchema.optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        bearerToken: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const config = await readClaudeConfig();
      const projectPath =
        input.scope === "project" ? input.projectPath : undefined;

      // Check server exists
      let servers: Record<string, McpServerConfig> | undefined;
      if (projectPath) {
        servers = config.projects?.[projectPath]?.mcpServers;
      } else {
        servers = config.mcpServers;
      }
      if (!servers?.[input.name]) {
        throw new Error(`Server "${input.name}" not found`);
      }

      const existing = servers[input.name];

      // Handle rename: create new, remove old
      if (input.newName && input.newName !== input.name) {
        if (servers[input.newName]) {
          throw new Error(`Server "${input.newName}" already exists`);
        }
        const updated = removeMcpServerConfig(
          config,
          projectPath ?? null,
          input.name,
        );
        const finalConfig = updateMcpServerConfig(
          updated,
          projectPath ?? null,
          input.newName,
          existing,
        );
        await writeClaudeConfig(finalConfig);
        return { success: true, name: input.newName };
      }

      // Build update object from provided fields
      const update: Partial<McpServerConfig> = {};
      if (input.command !== undefined) update.command = input.command;
      if (input.args !== undefined) update.args = input.args;
      if (input.env !== undefined) update.env = input.env;
      if (input.url !== undefined) update.url = input.url;
      if (input.disabled !== undefined) update.disabled = input.disabled;

      // Handle bearer token
      if (input.bearerToken) {
        update.authType = "bearer";
        update.headers = { Authorization: `Bearer ${input.bearerToken}` };
      }

      // Handle authType changes
      if (input.authType) {
        update.authType = input.authType;
        if (input.authType === "none") {
          // Clear auth-related fields
          update.headers = undefined;
          update._oauth = undefined;
        }
      }

      const merged = { ...existing, ...update };
      const updatedConfig = updateMcpServerConfig(
        config,
        projectPath ?? null,
        input.name,
        merged,
      );
      await writeClaudeConfig(updatedConfig);

      return { success: true, name: input.name };
    }),

  removeMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const config = await readClaudeConfig();
      const projectPath =
        input.scope === "project" ? input.projectPath : undefined;

      // Check server exists
      let servers: Record<string, McpServerConfig> | undefined;
      if (projectPath) {
        servers = config.projects?.[projectPath]?.mcpServers;
      } else {
        servers = config.mcpServers;
      }
      if (!servers?.[input.name]) {
        throw new Error(`Server "${input.name}" not found`);
      }

      const updated = removeMcpServerConfig(
        config,
        projectPath ?? null,
        input.name,
      );
      await writeClaudeConfig(updated);

      return { success: true };
    }),

  setMcpBearerToken: publicProcedure
    .input(
      z.object({
        name: z.string(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        token: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const config = await readClaudeConfig();
      const projectPath =
        input.scope === "project" ? input.projectPath : undefined;

      // Check server exists
      let servers: Record<string, McpServerConfig> | undefined;
      if (projectPath) {
        servers = config.projects?.[projectPath]?.mcpServers;
      } else {
        servers = config.mcpServers;
      }
      if (!servers?.[input.name]) {
        throw new Error(`Server "${input.name}" not found`);
      }

      const existing = servers[input.name];
      const updated: McpServerConfig = {
        ...existing,
        authType: "bearer",
        headers: { Authorization: `Bearer ${input.token}` },
      };

      const updatedConfig = updateMcpServerConfig(
        config,
        projectPath ?? null,
        input.name,
        updated,
      );
      await writeClaudeConfig(updatedConfig);

      return { success: true };
    }),

  getPendingPluginMcpApprovals: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }))
    .query(async ({ input }) => {
      const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
        await Promise.all([
          getEnabledPlugins(),
          discoverPluginMcpServers(),
          getApprovedPluginMcpServers(),
        ]);

      // Read global/project servers from all sources for conflict check
      const config = await readClaudeConfig();
      const dirConfig = await readClaudeDirConfig();
      const globalServers = await getMergedGlobalMcpServers(config, dirConfig);
      let projectServers: Record<string, McpServerConfig> = {};
      if (input.projectPath) {
        const projectConfigServers = await getMergedLocalProjectMcpServers(
          input.projectPath,
          config,
          dirConfig,
        );
        const projectMcpJsonServers = await readProjectMcpJsonCached(
          input.projectPath,
        );
        projectServers = { ...projectMcpJsonServers, ...projectConfigServers };
      }

      const pending: Array<{
        pluginSource: string;
        serverName: string;
        identifier: string;
        config: Record<string, unknown>;
      }> = [];

      for (const pluginConfig of pluginMcpConfigs) {
        if (!enabledPluginSources.includes(pluginConfig.pluginSource)) continue;

        for (const [name, serverConfig] of Object.entries(
          pluginConfig.mcpServers,
        )) {
          const identifier = `${pluginConfig.pluginSource}:${name}`;
          if (
            !approvedServers.includes(identifier) &&
            !globalServers[name] &&
            !projectServers[name]
          ) {
            pending.push({
              pluginSource: pluginConfig.pluginSource,
              serverName: name,
              identifier,
              config: serverConfig as Record<string, unknown>,
            });
          }
        }
      }

      return { pending };
    }),
});
