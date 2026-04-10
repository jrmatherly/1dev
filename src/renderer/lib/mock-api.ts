/**
 * API stubs for web-only features that are not yet restored in the desktop fork.
 *
 * ## Phase 2 status (2026-04-09): migrated consumers removed
 *
 * The `api.agents.*`, `api.useUtils`, `api.usage`, and `api.github.searchFiles`
 * procedures have been removed. Consumers now call `trpc.chats.*`,
 * `trpc.useUtils()`, and `trpc.files.search` directly. Message parsing moved
 * to `./message-parser.ts`.
 *
 * ## What remains
 *
 * This file preserves dead stubs for F-entry-dependent features
 * (`teams`, `stripe`, `user`, `github`, `claudeCode`, `agentInvites`,
 * `repositorySandboxes`) that return fake empty data so legacy upstream
 * code paths do not crash. These stubs are dead — nothing in the current
 * codebase imports them, but they document the shape of F-entry features
 * that will be restored per the F1-F10 roadmap.
 *
 * ## Phase 3 (future)
 *
 * Delete this file entirely after F1-F10 stubs are replaced by real
 * self-hosted implementations. See `docs/enterprise/upstream-features.md`
 * for the restoration catalog.
 *
 * See `openspec/changes/migrate-mock-api-consumers/` for the Phase 2 proposal.
 */

type AnyObj = Record<string, any>;

/**
 * Dead stubs for web-only features. Every stub returns fake empty data so
 * legacy upstream code paths do not crash when they exist (they do not
 * currently — this file has zero importers as of Phase 2 completion).
 *
 * When F-entry restoration work begins, replace each stub with a real
 * `trpc.*` call to the self-hosted backend.
 */
export const api = {
  teams: {
    getUserTeams: { useQuery: () => ({ data: [], isLoading: false }) },
    getTeam: { useQuery: () => ({ data: null, isLoading: false }) },
    updateTeam: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
  },
  repositorySandboxes: {
    getRepositoriesWithStatus: {
      useQuery: () => ({
        data: { repositories: [] },
        isLoading: false,
        refetch: async () => ({ data: { repositories: [] } }),
      }),
    },
  },
  stripe: {
    getUserBalance: { useQuery: () => ({ data: 0, isLoading: false }) },
    createCheckoutSession: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({ url: "" }),
        isPending: false,
      }),
    },
    createBillingPortalSession: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({ url: "" }),
        isPending: false,
      }),
    },
  },
  user: {
    getProfile: { useQuery: () => ({ data: null, isLoading: false }) },
    updateProfile: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
  },
  github: {
    getBranches: {
      useQuery: () => ({
        data: { branches: [] },
        isLoading: false,
        refetch: async () => ({ data: { branches: [] } }),
      }),
    },
    getSlashCommands: { useQuery: () => ({ data: [], isLoading: false }) },
    getUserInstallations: { useQuery: () => ({ data: [], isLoading: false }) },
    getGithubConnection: {
      useQuery: () => ({ data: { isConnected: false }, isLoading: false }),
    },
    connectGithub: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
    disconnectGithub: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
    createBranch: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({ branch: "" }),
        isPending: false,
      }),
    },
  },
  claudeCode: {
    getClaudeCodeConnection: {
      useQuery: () => ({ data: { isConnected: true }, isLoading: false }),
    },
    connectClaudeCode: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
    disconnectClaudeCode: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
  },
  agentInvites: {
    getOrCreateInviteCode: {
      useQuery: () => ({
        data: { maxUses: 0, usesCount: 0 },
        isLoading: false,
      }),
    },
  },
} satisfies AnyObj;
