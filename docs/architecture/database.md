---
title: Database (Drizzle ORM)
icon: database
---

# Database {subtitle="Drizzle ORM + better-sqlite3, 7 tables, auto-migrated on startup"}

1Code uses **Drizzle ORM** over **better-sqlite3** for local-first persistence. The database file lives at `{userData}/data/agents.db` (platform-specific; on macOS this is `~/Library/Application Support/Agents Dev/data/agents.db`).

The Drizzle schema at [`src/main/lib/db/schema/index.ts`](https://github.com/jrmatherly/1dev/blob/main/src/main/lib/db/schema/index.ts) is the **single source of truth**. Migrations are generated from it via `bun run db:generate` and applied automatically on app startup by `initDatabase()`.

## Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `projects` | Local project folder registered for chat sessions | `id`, `name`, `path` |
| `chats` | Top-level chat session linked to a project | `id`, `projectId` (FK, indexed), `title`, `createdAt` |
| `sub_chats` | Agent sub-sessions within a chat | `id`, `chatId` (FK, indexed), `role`, `mode` (plan/agent) |
| `claude_code_credentials` | Encrypted Claude CLI OAuth tokens | `id`, `ciphertext` |
| `anthropic_accounts` | Multi-account Anthropic credential store | `id`, `label`, `ciphertext`, `isDefault` |
| `anthropic_settings` | Per-account model + system-prompt preferences | `accountId`, `model`, `systemPrompt` |
| `feature_flag_overrides` | Runtime flag overrides (feature-flags subsystem) | `key`, `value` |

All credential ciphertext is encrypted via `src/main/lib/credential-store.ts` — the single sanctioned entry point for `safeStorage.encryptString/decryptString` (enforced by `tests/regression/credential-storage-tier.test.ts`).

## Migration workflow

```bash
# Generate a migration from schema changes (creates drizzle/NNNN_*.sql)
bun run db:generate

# Push schema directly without a migration (dev only — skips the migration file)
bun run db:push

# Open the Drizzle Studio GUI at http://localhost:4983
bun run db:studio
```

**Do not hand-edit generated migration files** under `drizzle/` — they are produced mechanically from the schema. If a migration needs a correction, change the schema and regenerate.

Current migration count: **10 files** (`0000_*.sql` through `0009_*.sql`), the latest adding FK indexes for `chats.projectId` and `sub_chats.chatId`.

## Auto-migration on startup

`initDatabase()` (in `src/main/lib/db/index.ts`) runs `migrate(db, { migrationsFolder: "./drizzle" })` before the first query. SQLite pragmas are applied at the same time: `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000` for performance under concurrent reads.

## Drift guarantees

The **`db-schema-auditor`** subagent (`.claude/agents/db-schema-auditor.md`) enforces that:

- The table count in this document matches the `sqliteTable(` count in the schema file
- Every migration file in `drizzle/` corresponds to a schema change
- CLAUDE.md and Serena memory counts agree

## Related

- [tRPC Routers](./trpc-routers.md) — routers consume the schema through `src/main/lib/db/index.ts`
- [`.claude/rules/database.md`](https://github.com/jrmatherly/1dev/blob/main/.claude/rules/database.md) — schema-as-source-of-truth rule
- [Codebase Layout](./codebase-layout.md) — where the schema file lives in the `src/` tree
