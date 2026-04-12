import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { auditLog } from "../db/schema.js";

// ---- AuditAction type -------------------------------------------------------

/**
 * Closed string-literal union of all valid audit action values.
 *
 * Use `AUDIT_ACTIONS.<NAME>` at call sites — TypeScript infers the narrow
 * literal type, so passing any string not in this union fails `bun run ts:check`
 * without a runtime check.
 */
export const AUDIT_ACTIONS = {
  ACTION_USER_PROVISIONED: "user.provisioned",
  ACTION_USER_DEPROVISIONED: "user.deprovisioned",
  ACTION_TEAM_SYNCED: "team.synced",
  ACTION_MEMBERSHIP_ADDED: "membership.added",
  ACTION_KEY_GENERATED: "key.generated",
  ACTION_KEY_ROTATED: "key.rotated",
  ACTION_KEY_AUTO_ROTATED: "key.auto_rotated",
  ACTION_KEY_REVOKED: "key.revoked",
  ACTION_KEY_DEPROVISIONED: "key.deprovisioned",
  ACTION_KEY_GENERATION_ORPHANED: "key.generation_orphaned",
  ACTION_EMAIL_CHANGED: "email.changed",
  ACTION_CRON_DEPROVISIONING_ABORTED: "cron.deprovisioning_aborted",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ---- Transaction type alias ------------------------------------------------

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// ---- logAction -------------------------------------------------------------

export interface LogActionParams {
  /** Drizzle db instance or active transaction */
  tx: DrizzleDb;
  actorEmail: string;
  actorEntraOid: string;
  /** Must be a value from AUDIT_ACTIONS — type-enforced */
  action: AuditAction;
  targetType: string;
  targetId: string;
  /** Optional structured details — will be JSON-stringified */
  details?: Record<string, unknown>;
}

/**
 * Insert a single row into `audit_log`. Accepts either the top-level `db`
 * instance or a Drizzle transaction so audit writes can participate in the
 * provisioning transaction boundary.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  const {
    tx,
    actorEmail,
    actorEntraOid,
    action,
    targetType,
    targetId,
    details,
  } = params;

  await tx.insert(auditLog).values({
    actorEmail,
    actorEntraOid,
    action,
    targetType,
    targetId,
    details: details !== undefined ? JSON.stringify(details) : null,
  });
}
