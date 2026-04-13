/**
 * MCP resolver — aggregates MCP server configs across scopes (global, project,
 * plugin) and probes them for liveness.
 *
 * Extracted from claude.ts as part of security-hardening-and-quality-remediation §7.
 *
 * Owns five module-level caches:
 *   - workingMcpServers: scope::server → liveness flag (resets on app restart)
 *   - symlinksCreated: Set of subChatIds that already have symlinks created
 *   - mcpConfigCache: mtime-based cache for ~/.claude.json + ~/.claude/.claude.json
 *   - projectMcpJsonCache: mtime-based cache for per-project .mcp.json files
 *
 * Public handler getAllMcpConfigHandler is called from:
 *   - claudeRouter.getAllMcpConfig tRPC query
 *   - src/main/index.ts app startup (prewarm)
 */

import * as fs from "fs/promises";
import path from "path";
import {
  getMergedGlobalMcpServers,
  getMergedLocalProjectMcpServers,
  GLOBAL_MCP_PATH,
  readClaudeConfig,
  readClaudeDirConfig,
  readProjectMcpJson,
  type ClaudeConfig,
  type McpServerConfig,
} from "../claude-config";
import { projects as projectsTable, getDatabase } from "../db";
import {
  ensureMcpTokensFresh,
  fetchMcpTools,
  fetchMcpToolsStdio,
  type McpToolInfo,
} from "../mcp-auth";
import { fetchOAuthMetadata, getMcpBaseUrl } from "../oauth";
import { discoverPluginMcpServers } from "../plugins";
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "../trpc/routers/claude-settings";

// ── Caches (all reset on app restart; explicit clearMcpResolverCaches below) ──

/** In-memory cache of working MCP server names. Key: "scope::serverName" where scope is "__global__" or projectPath. */
export const workingMcpServers = new Map<string, boolean>();

/** Track which subChatIds have already had their symlinks created this session. */
export const symlinksCreated = new Set<string>();

/** mtime-based cache for top-level Claude config files (avoids re-reading on every message). */
export const mcpConfigCache = new Map<
  string,
  {
    config: Record<string, unknown> | undefined;
    mtime: number;
  }
>();

/** mtime-based cache for per-project .mcp.json files. */
export const projectMcpJsonCache = new Map<
  string,
  {
    servers: Record<string, McpServerConfig>;
    mtime: number;
  }
>();

const GLOBAL_SCOPE = "__global__";

/** Build scoped cache key for workingMcpServers. */
export function mcpCacheKey(scope: string | null, serverName: string): string {
  return `${scope ?? GLOBAL_SCOPE}::${serverName}`;
}

/** Read .mcp.json with mtime-based caching. */
export async function readProjectMcpJsonCached(
  projectPath: string,
): Promise<Record<string, McpServerConfig>> {
  try {
    const mcpJsonPath = path.join(projectPath, ".mcp.json");
    const stats = await fs.stat(mcpJsonPath).catch(() => null);
    if (!stats) return {};

    const cached = projectMcpJsonCache.get(mcpJsonPath);
    if (cached?.mtime === stats.mtimeMs) {
      return cached.servers;
    }

    const servers = await readProjectMcpJson(projectPath);
    projectMcpJsonCache.set(mcpJsonPath, {
      servers,
      mtime: stats.mtimeMs,
    });
    return servers;
  } catch {
    return {};
  }
}

/** Clear the three mcp-resolver mtime caches (but NOT the workingMcpServers liveness cache). */
export function clearMcpResolverCaches(): void {
  symlinksCreated.clear();
  mcpConfigCache.clear();
  projectMcpJsonCache.clear();
}

// ── Server status + tool fetch ────────────────────────────────────────────────

/**
 * Mirror of MCPServerStatus from src/renderer/lib/atoms/index.ts. Defined
 * locally here because main process code must not import from renderer.
 * TypeScript structural typing ensures the two literal unions stay
 * compatible across the tRPC boundary.
 */
export type McpServerStatus =
  | "connected"
  | "failed"
  | "pending"
  | "needs-auth";

/**
 * Determine server status based on config.
 * - authType "none" → "connected" (no auth required)
 * - Authorization header present → "connected" (OAuth completed, SDK can use it)
 * - _oauth but no headers → "needs-auth" (legacy config, needs re-auth to migrate)
 * - HTTP server (has URL) with explicit authType → "needs-auth"
 * - HTTP server without authType → "connected" (assume public)
 * - Local stdio server → "connected"
 */
export function getServerStatusFromConfig(
  serverConfig: McpServerConfig,
): McpServerStatus {
  const headers = serverConfig.headers as Record<string, string> | undefined;
  const { _oauth: oauth, authType } = serverConfig;

  if (authType === "none") {
    return "connected";
  }
  if (headers?.Authorization) {
    return "connected";
  }
  if (oauth?.accessToken && !headers?.Authorization) {
    return "needs-auth";
  }
  if (serverConfig.url && ["oauth", "bearer"].includes(authType ?? "")) {
    return "needs-auth";
  }
  return "connected";
}

const MCP_FETCH_TIMEOUT_MS = 40_000;

/**
 * Fetch tools from an MCP server (HTTP or stdio transport). Times out after
 * MCP_FETCH_TIMEOUT_MS to prevent slow servers from blocking the cache update.
 */
export async function fetchToolsForServer(
  serverConfig: McpServerConfig,
): Promise<McpToolInfo[]> {
  const timeoutPromise = new Promise<McpToolInfo[]>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), MCP_FETCH_TIMEOUT_MS),
  );

  const fetchPromise = (async () => {
    if (serverConfig.url) {
      const headers = serverConfig.headers as
        | Record<string, string>
        | undefined;
      try {
        return await fetchMcpTools(serverConfig.url, headers);
      } catch {
        return [];
      }
    }

    const command = serverConfig.command;
    if (command) {
      try {
        return await fetchMcpToolsStdio({
          command,
          args: serverConfig.args,
          env: serverConfig.env as Record<string, string> | undefined,
        });
      } catch {
        return [];
      }
    }

    return [];
  })();

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch {
    return [];
  }
}

// ── Aggregator handler ────────────────────────────────────────────────────────

/**
 * Handler for getAllMcpConfig — exported so it can be called on app startup
 * to prewarm the workingMcpServers cache before the renderer asks.
 */
export async function getAllMcpConfigHandler() {
  try {
    const totalStart = Date.now();

    workingMcpServers.clear();

    const config = await readClaudeConfig();

    const convertServers = async (
      servers: Record<string, McpServerConfig> | undefined,
      scope: string | null,
    ) => {
      if (!servers) return [];

      const results = await Promise.all(
        Object.entries(servers).map(async ([name, serverConfig]) => {
          const configObj = serverConfig as Record<string, unknown>;
          const headers = serverConfig.headers as
            | Record<string, string>
            | undefined;

          let tools: McpToolInfo[] = [];
          let needsAuth = false;

          try {
            tools = await fetchToolsForServer(serverConfig);
          } catch (error) {
            console.error(`[MCP] Failed to fetch tools for ${name}:`, error);
          }

          let status: string;
          const cacheKey = mcpCacheKey(scope, name);
          if (tools.length > 0) {
            status = "connected";
            workingMcpServers.set(cacheKey, true);
          } else {
            workingMcpServers.set(cacheKey, false);
            if (serverConfig.url) {
              try {
                const baseUrl = getMcpBaseUrl(serverConfig.url);
                const metadata = await fetchOAuthMetadata(baseUrl);
                needsAuth = !!metadata && !!metadata.authorization_endpoint;
              } catch {
                // If probe fails, assume no auth needed
              }
            } else if (
              serverConfig.authType === "oauth" ||
              serverConfig.authType === "bearer"
            ) {
              needsAuth = true;
            }

            if (needsAuth && !headers?.Authorization) {
              status = "needs-auth";
            } else {
              status = "failed";
            }
          }

          return { name, status, tools, needsAuth, config: configObj };
        }),
      );

      return results;
    };

    const groupTasks: Array<{
      groupName: string;
      projectPath: string | null;
      promise: Promise<{
        mcpServers: Array<{
          name: string;
          status: string;
          tools: McpToolInfo[];
          needsAuth: boolean;
          config: Record<string, unknown>;
        }>;
        duration: number;
      }>;
    }> = [];

    let claudeDirConfig: ClaudeConfig = {};
    try {
      claudeDirConfig = await readClaudeDirConfig();
    } catch {
      /* ignore */
    }

    const mergedGlobalServers = await getMergedGlobalMcpServers(
      config,
      claudeDirConfig,
    );
    if (Object.keys(mergedGlobalServers).length > 0) {
      groupTasks.push({
        groupName: "Global",
        projectPath: null,
        promise: (async () => {
          const start = Date.now();
          const freshServers = await ensureMcpTokensFresh(
            mergedGlobalServers,
            GLOBAL_MCP_PATH,
          );
          const mcpServers = await convertServers(freshServers, null);
          return { mcpServers, duration: Date.now() - start };
        })(),
      });
    } else {
      groupTasks.push({
        groupName: "Global",
        projectPath: null,
        promise: Promise.resolve({ mcpServers: [], duration: 0 }),
      });
    }

    const allProjectPaths = new Set<string>();
    if (config.projects) {
      for (const p of Object.keys(config.projects)) allProjectPaths.add(p);
    }
    if (claudeDirConfig.projects) {
      for (const p of Object.keys(claudeDirConfig.projects))
        allProjectPaths.add(p);
    }

    for (const projectPath of allProjectPaths) {
      const mergedProjectServers = await getMergedLocalProjectMcpServers(
        projectPath,
        config,
        claudeDirConfig,
      );

      const projectMcpJsonServers = await readProjectMcpJsonCached(projectPath);

      const allProjectServers = {
        ...projectMcpJsonServers,
        ...mergedProjectServers,
      };

      if (Object.keys(allProjectServers).length > 0) {
        const groupName = path.basename(projectPath) || projectPath;
        groupTasks.push({
          groupName,
          projectPath,
          promise: (async () => {
            const start = Date.now();
            const freshServers = await ensureMcpTokensFresh(
              allProjectServers,
              projectPath,
            );
            const mcpServers = await convertServers(freshServers, projectPath);
            return { mcpServers, duration: Date.now() - start };
          })(),
        });
      }
    }

    try {
      const db = getDatabase();
      const dbProjects = db
        .select({ path: projectsTable.path })
        .from(projectsTable)
        .all();
      for (const proj of dbProjects) {
        if (!proj.path || allProjectPaths.has(proj.path)) continue;
        const mcpJsonServers = await readProjectMcpJsonCached(proj.path);
        if (Object.keys(mcpJsonServers).length > 0) {
          const groupName = path.basename(proj.path) || proj.path;
          groupTasks.push({
            groupName,
            projectPath: proj.path,
            promise: (async () => {
              const start = Date.now();
              const mcpServers = await convertServers(
                mcpJsonServers,
                proj.path,
              );
              return { mcpServers, duration: Date.now() - start };
            })(),
          });
        }
      }
    } catch (dbErr) {
      console.error("[MCP] DB project discovery error:", dbErr);
    }

    const results = await Promise.all(groupTasks.map((t) => t.promise));

    const groupsWithTiming = groupTasks.map((task, i) => ({
      groupName: task.groupName,
      projectPath: task.projectPath,
      mcpServers: results[i].mcpServers,
      duration: results[i].duration,
    }));

    const totalDuration = Date.now() - totalStart;
    const workingCount = [...workingMcpServers.values()].filter(
      Boolean,
    ).length;
    const sortedByDuration = [...groupsWithTiming].sort(
      (a, b) => b.duration - a.duration,
    );

    console.log(
      `[MCP] Cache updated in ${totalDuration}ms. Working: ${workingCount}/${workingMcpServers.size}`,
    );
    for (const g of sortedByDuration) {
      if (g.mcpServers.length > 0) {
        console.log(
          `[MCP]   ${g.groupName}: ${g.duration}ms (${g.mcpServers.length} servers)`,
        );
      }
    }

    const groups = groupsWithTiming.map(
      ({ groupName, projectPath, mcpServers }) => ({
        groupName,
        projectPath,
        mcpServers,
      }),
    );

    const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
      await Promise.all([
        getEnabledPlugins(),
        discoverPluginMcpServers(),
        getApprovedPluginMcpServers(),
      ]);

    for (const pluginConfig of pluginMcpConfigs) {
      if (!enabledPluginSources.includes(pluginConfig.pluginSource)) continue;

      const globalServerNames = Object.keys(mergedGlobalServers);
      if (Object.keys(pluginConfig.mcpServers).length > 0) {
        const pluginMcpServers = (
          await Promise.all(
            Object.entries(pluginConfig.mcpServers).map(
              async ([name, serverConfig]) => {
                if (globalServerNames.includes(name)) return null;

                const configObj = serverConfig as Record<string, unknown>;
                const identifier = `${pluginConfig.pluginSource}:${name}`;
                const isApproved = approvedServers.includes(identifier);

                if (!isApproved) {
                  return {
                    name,
                    status: "pending-approval",
                    tools: [] as McpToolInfo[],
                    needsAuth: false,
                    config: configObj,
                    isApproved,
                  };
                }

                const headers = serverConfig.headers as
                  | Record<string, string>
                  | undefined;
                let tools: McpToolInfo[] = [];
                let needsAuth = false;

                try {
                  tools = await fetchToolsForServer(serverConfig);
                } catch (error) {
                  console.error(
                    `[MCP] Failed to fetch tools for plugin ${name}:`,
                    error,
                  );
                }

                let status: string;
                if (tools.length > 0) {
                  status = "connected";
                } else {
                  if (serverConfig.url) {
                    try {
                      const baseUrl = getMcpBaseUrl(serverConfig.url);
                      const metadata = await fetchOAuthMetadata(baseUrl);
                      needsAuth =
                        !!metadata && !!metadata.authorization_endpoint;
                    } catch {
                      // If probe fails, assume no auth needed
                    }
                  } else if (
                    serverConfig.authType === "oauth" ||
                    serverConfig.authType === "bearer"
                  ) {
                    needsAuth = true;
                  }

                  if (needsAuth && !headers?.Authorization) {
                    status = "needs-auth";
                  } else {
                    status = "failed";
                  }
                }

                return {
                  name,
                  status,
                  tools,
                  needsAuth,
                  config: configObj,
                  isApproved,
                };
              },
            ),
          )
        ).filter((s): s is NonNullable<typeof s> => s !== null);

        groups.push({
          groupName: `Plugin: ${pluginConfig.pluginSource}`,
          projectPath: null,
          mcpServers: pluginMcpServers,
        });
      }
    }

    return { groups };
  } catch (error) {
    console.error("[getAllMcpConfig] Error:", error);
    return { groups: [], error: String(error) };
  }
}
