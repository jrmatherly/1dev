/**
 * Type stub for the remote 21st.dev web backend's AppRouter.
 *
 * The actual router lives in the hosted web product. This file reconstructs the
 * router TYPE using tRPC's exported type helpers so that `createTRPCClient<AppRouter>`
 * gives full autocompletion and type checking for the procedures we call from the
 * desktop app.
 *
 * Only `import type` is used — no @trpc/server runtime code is bundled into the renderer.
 *
 * IMPORTANT: This stub must be kept in sync with the hosted backend. When backend
 * procedures are added, removed, or change signatures, update this file accordingly.
 *
 * The `transformer: true` flag in AppRootTypes is critical — it tells tRPC's type
 * inference that SuperJSON is used, so output types are passed through as-is (Date
 * stays Date, etc.) rather than being wrapped in `Serialize<T>`.
 *
 * See .scratchpad/typed-approuter-implementation-plan.md for full details.
 */
import type {
  TRPCBuiltRouter,
  TRPCMutationProcedure,
  TRPCQueryProcedure,
} from "@trpc/server"
import type {
  RemoteChat,
  RemoteChatWithSubChats,
  Team,
} from "./remote-api"

// ---------------------------------------------------------------------------
// teams.* procedures
// ---------------------------------------------------------------------------
type TeamsRecord = {
  getUserTeams: TRPCQueryProcedure<{
    meta: unknown
    input: void
    output: Team[]
  }>
}

// ---------------------------------------------------------------------------
// agents.* procedures
// ---------------------------------------------------------------------------
type AgentsRecord = {
  getAgentChats: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string }
    output: RemoteChat[]
  }>
  getAgentChat: TRPCQueryProcedure<{
    meta: unknown
    input: { chatId: string }
    output: RemoteChatWithSubChats
  }>
  getArchivedChats: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string }
    output: RemoteChat[]
  }>
  archiveChat: TRPCMutationProcedure<{
    meta: unknown
    input: { chatId: string }
    output: void
  }>
  archiveChatsBatch: TRPCMutationProcedure<{
    meta: unknown
    input: { chatIds: string[] }
    output: { archivedCount: number }
  }>
  restoreChat: TRPCMutationProcedure<{
    meta: unknown
    input: { chatId: string }
    output: void
  }>
  renameSubChat: TRPCMutationProcedure<{
    meta: unknown
    input: { subChatId: string; name: string }
    output: void
  }>
  renameChat: TRPCMutationProcedure<{
    meta: unknown
    input: { chatId: string; name: string }
    output: void
  }>
  getAgentsSubscription: TRPCQueryProcedure<{
    meta: unknown
    input: void
    output: { type: string }
  }>
}

// ---------------------------------------------------------------------------
// automations.* procedures
// ---------------------------------------------------------------------------
type AutomationTrigger = {
  id?: string
  platform: string
  trigger_type: string
  filters: unknown[]
}

type AutomationDetail = {
  id: string
  name: string
  agent_prompt: string
  add_to_inbox: boolean
  respond_to_trigger: boolean
  is_enabled: boolean
  target_repository: string | null
  triggers: AutomationTrigger[]
  executions: unknown[]
}

type InboxChatsResponse = {
  chats: unknown[]
}

type CreateAutomationInput = {
  teamId: string
  name: string
  agentPrompt: string
  addToInbox: boolean
  respondToTrigger: boolean
  triggers: AutomationTrigger[]
  targetRepository?: string
}

type UpdateAutomationInput = {
  automationId: string
  name?: string
  agentPrompt?: string
  addToInbox?: boolean
  respondToTrigger?: boolean
  isEnabled?: boolean
  triggers?: AutomationTrigger[]
  targetRepository?: string | null
}

type AutomationsRecord = {
  getInboxUnreadCount: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string }
    output: { count: number }
  }>
  listAutomations: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string }
    output: unknown[]
  }>
  getAutomation: TRPCQueryProcedure<{
    meta: unknown
    input: { automationId: string }
    output: AutomationDetail
  }>
  listExecutions: TRPCQueryProcedure<{
    meta: unknown
    input: { automationId: string; limit: number; offset: number }
    output: { executions: unknown[]; total: number }
  }>
  createAutomation: TRPCMutationProcedure<{
    meta: unknown
    input: CreateAutomationInput
    output: void
  }>
  updateAutomation: TRPCMutationProcedure<{
    meta: unknown
    input: UpdateAutomationInput
    output: void
  }>
  deleteAutomation: TRPCMutationProcedure<{
    meta: unknown
    input: { automationId: string }
    output: void
  }>
  getInboxChats: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string; limit: number }
    output: InboxChatsResponse
  }>
  markInboxItemRead: TRPCMutationProcedure<{
    meta: unknown
    input: { executionId: string }
    output: void
  }>
  markAllInboxItemsRead: TRPCMutationProcedure<{
    meta: unknown
    input: { teamId: string }
    output: void
  }>
}

// ---------------------------------------------------------------------------
// github.* procedures
// ---------------------------------------------------------------------------
type ConnectionStatus = {
  isConnected: boolean
}

type GithubRecord = {
  getConnectionStatus: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string }
    output: ConnectionStatus
  }>
}

// ---------------------------------------------------------------------------
// linear.* procedures
// ---------------------------------------------------------------------------
type LinearRecord = {
  getIntegration: TRPCQueryProcedure<{
    meta: unknown
    input: { teamId: string }
    output: ConnectionStatus
  }>
}

// ---------------------------------------------------------------------------
// Combined router record
// ---------------------------------------------------------------------------
type AppRouterRecord = {
  teams: TeamsRecord
  agents: AgentsRecord
  automations: AutomationsRecord
  github: GithubRecord
  linear: LinearRecord
}

// ---------------------------------------------------------------------------
// Root types — must match the remote server's tRPC config.
// `transformer: true` is required because the remote server uses SuperJSON.
// ---------------------------------------------------------------------------
type AppRootTypes = {
  ctx: object
  meta: object
  errorShape: { message: string; code: number }
  transformer: true
}

// ---------------------------------------------------------------------------
// The AppRouter type — satisfies AnyRouter, usable with createTRPCClient<>
// ---------------------------------------------------------------------------
export type AppRouter = TRPCBuiltRouter<AppRootTypes, AppRouterRecord>
