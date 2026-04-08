/**
 * Remote API - wrapper around tRPC client for web backend
 * Provides clean interface for fetching remote sandbox data
 */
import { remoteTrpc } from "./remote-trpc";

// API base URL - dynamically fetched from main process
let API_BASE: string | null = null;

async function getApiBase(): Promise<string> {
  if (!API_BASE) {
    API_BASE =
      (await window.desktopApi?.getApiBaseUrl()) || "https://apollosai.dev";
  }
  return API_BASE;
}

// Re-export types from the shared types file for convenience
export type {
  RemoteChat,
  RemoteChatWithSubChats,
  RemoteSubChat,
  Team,
} from "./remote-types";
import type { RemoteChat, RemoteChatWithSubChats, Team } from "./remote-types";

export const remoteApi = {
  /**
   * Fetch user's teams (same as web)
   */
  async getTeams(): Promise<Team[]> {
    const teams = await remoteTrpc.teams.getUserTeams.query();
    return teams.map((t) => ({ id: t.id, name: t.name }));
  },

  /**
   * Fetch all agent chats for a team (same as web)
   */
  async getAgentChats(teamId: string): Promise<RemoteChat[]> {
    return await remoteTrpc.agents.getAgentChats.query({ teamId });
  },

  /**
   * Fetch a single agent chat with all sub-chats (same as web)
   */
  async getAgentChat(chatId: string): Promise<RemoteChatWithSubChats> {
    return await remoteTrpc.agents.getAgentChat.query({ chatId });
  },

  /**
   * Fetch archived chats for a team (same as web)
   */
  async getArchivedChats(teamId: string): Promise<RemoteChat[]> {
    return await remoteTrpc.agents.getArchivedChats.query({ teamId });
  },

  /**
   * Archive a chat
   */
  async archiveChat(chatId: string): Promise<void> {
    await remoteTrpc.agents.archiveChat.mutate({ chatId });
  },

  /**
   * Archive multiple chats at once
   */
  async archiveChatsBatch(
    chatIds: string[],
  ): Promise<{ archivedCount: number }> {
    return await remoteTrpc.agents.archiveChatsBatch.mutate({ chatIds });
  },

  /**
   * Restore a chat from archive
   */
  async restoreChat(chatId: string): Promise<void> {
    await remoteTrpc.agents.restoreChat.mutate({ chatId });
  },

  /**
   * Rename a sub-chat
   */
  async renameSubChat(subChatId: string, name: string): Promise<void> {
    await remoteTrpc.agents.renameSubChat.mutate({ subChatId, name });
  },

  /**
   * Rename a chat (workspace)
   */
  async renameChat(chatId: string, name: string): Promise<void> {
    await remoteTrpc.agents.renameChat.mutate({ chatId, name });
  },

  /**
   * Get diff from a sandbox (via REST endpoint with signedFetch)
   */
  async getSandboxDiff(sandboxId: string): Promise<{ diff: string }> {
    if (!window.desktopApi?.signedFetch) {
      throw new Error("Desktop API not available");
    }
    const apiBase = await getApiBase();
    const result = await window.desktopApi.signedFetch(
      `${apiBase}/api/agents/sandbox/${sandboxId}/diff`,
    );
    if (!result.ok) {
      throw new Error(result.error || `Failed to fetch diff: ${result.status}`);
    }
    return result.data as { diff: string };
  },

  /**
   * Get file content from a sandbox (via REST endpoint with signedFetch)
   */
  async getSandboxFile(
    sandboxId: string,
    path: string,
  ): Promise<{ content: string }> {
    if (!window.desktopApi?.signedFetch) {
      throw new Error("Desktop API not available");
    }
    const apiBase = await getApiBase();
    const result = await window.desktopApi.signedFetch(
      `${apiBase}/api/agents/sandbox/${sandboxId}/files?path=${encodeURIComponent(path)}`,
    );
    if (!result.ok) {
      throw new Error(result.error || `Failed to fetch file: ${result.status}`);
    }
    return result.data as { content: string };
  },
};
