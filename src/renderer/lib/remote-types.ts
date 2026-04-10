/**
 * Shared types for the legacy upstream tRPC client. The upstream backend is
 * retiring in favor of the self-hosted apollosai.dev infrastructure — see
 * docs/enterprise/upstream-features.md for the retirement plan.
 *
 * Extracted from `remote-api.ts` to break the circular dependency between
 * `remote-app-router.ts` (type stub) and `remote-api.ts` (consumer wrapper).
 *
 * Both files import from here; neither imports from the other at the type level.
 */

export type Team = {
  id: string;
  name: string;
  slug?: string;
};

export type RemoteChat = {
  id: string;
  name: string;
  sandbox_id: string | null;
  meta: {
    repository?: string;
    github_repo?: string; // Automation-created chats use this field
    branch?: string | null;
    originalSandboxId?: string | null;
    isQuickSetup?: boolean;
    isPublicImport?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
  stats: { fileCount: number; additions: number; deletions: number } | null;
};

export type RemoteSubChat = {
  id: string;
  name: string;
  mode: string;
  messages: unknown[];
  stream_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RemoteChatWithSubChats = RemoteChat & {
  subChats: RemoteSubChat[];
};

// --- Automation types ---

export type AutomationTriggerFilter = {
  field: string;
  operator: string;
  value: string;
};

export type AutomationTrigger = {
  id?: string;
  platform: string;
  trigger_type: string;
  filters: AutomationTriggerFilter[];
};

export type AutomationExecution = {
  id: string;
  status: string;
  external_id: string | null;
  external_url: string | null;
  error_message: string | null;
  created_at: string;
};

/** Summary shape returned by `automations.listAutomations`. */
export type Automation = {
  id: string;
  name: string;
  is_enabled: boolean;
  triggers: Array<{ trigger_type: string; platform?: string }>;
};

/** Detail shape returned by `automations.getAutomation`. */
export type AutomationDetail = {
  id: string;
  name: string;
  agent_prompt: string;
  add_to_inbox: boolean;
  respond_to_trigger: boolean;
  is_enabled: boolean;
  target_repository: string | null;
  triggers: AutomationTrigger[];
  executions: AutomationExecution[];
};

export type InboxChat = {
  id: string;
  executionId: string;
  name: string;
  createdAt: Date;
  automationId: string;
  automationName: string;
  externalUrl: string | null;
  status: string;
  isRead: boolean;
  meta?: { repository?: string; branch?: string } | null;
};

export type ConnectionStatus = {
  isConnected: boolean;
};

// --- Input types for mutations ---

export type CreateAutomationInput = {
  teamId: string;
  name: string;
  agentPrompt: string;
  addToInbox: boolean;
  respondToTrigger: boolean;
  triggers: AutomationTrigger[];
  targetRepository?: string;
};

export type UpdateAutomationInput = {
  automationId: string;
  name?: string;
  agentPrompt?: string;
  addToInbox?: boolean;
  respondToTrigger?: boolean;
  isEnabled?: boolean;
  triggers?: AutomationTrigger[];
  targetRepository?: string | null;
};
