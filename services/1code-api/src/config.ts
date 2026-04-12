import { z } from "zod";

/**
 * Config schema with a conditional guard:
 *
 * `PROVISIONING_ENABLED` is a tri-state string env var ("true"|"false"|"1"|"0")
 * that parses to a boolean. When `true`, `.superRefine()` verifies that all
 * provisioning-related env vars (LiteLLM base URL + master key, Azure tenant
 * and Graph app-reg credentials, teams config path) are present and valid.
 *
 * When `false` (the default), those fields are optional — this preserves
 * local-dev ergonomics for devs who only need the baseline endpoints
 * (`/api/changelog/desktop`, `/api/desktop/user/plan`, `PATCH /api/user/profile`,
 * `/health`).
 *
 * Per design.md Decision 3, the flag is read once at boot. Flipping it
 * requires a pod restart (Flux reconcile → rolling deploy).
 */
const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const configSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8000),
    DATABASE_URL: z.string().min(1),
    DEV_BYPASS_AUTH: booleanFlag,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),

    // Provisioning feature flag + its conditionally-required dependencies.
    // All optional at the base schema level; `.superRefine()` below enforces
    // presence when PROVISIONING_ENABLED is true.
    PROVISIONING_ENABLED: booleanFlag,
    LITELLM_BASE_URL: z.string().url().optional(),
    LITELLM_MASTER_KEY: z.string().min(1).optional(),
    AZURE_TENANT_ID: z.string().uuid().optional(),
    AZURE_GRAPH_CLIENT_ID: z.string().uuid().optional(),
    AZURE_GRAPH_CLIENT_SECRET: z.string().min(1).optional(),
    TEAMS_CONFIG_PATH: z.string().default("/app/config/teams.yaml"),
    DEPROVISIONING_MAX_PER_RUN: z.coerce.number().int().positive().default(20),
  })
  .superRefine((data, ctx) => {
    if (!data.PROVISIONING_ENABLED) return;

    const required = [
      ["LITELLM_BASE_URL", data.LITELLM_BASE_URL],
      ["LITELLM_MASTER_KEY", data.LITELLM_MASTER_KEY],
      ["AZURE_TENANT_ID", data.AZURE_TENANT_ID],
      ["AZURE_GRAPH_CLIENT_ID", data.AZURE_GRAPH_CLIENT_ID],
      ["AZURE_GRAPH_CLIENT_SECRET", data.AZURE_GRAPH_CLIENT_SECRET],
    ] as const;

    for (const [name, value] of required) {
      if (value === undefined || value === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} is required when PROVISIONING_ENABLED=true`,
        });
      }
    }
  });

/**
 * Parse env into config. Exported as a function so unit tests can
 * re-parse with mocked `process.env` instead of the module-load-time
 * singleton.
 */
export function parseConfig(
  env: NodeJS.ProcessEnv = process.env,
): z.infer<typeof configSchema> {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${errors.join("\n")}`);
  }
  return parsed.data;
}

let cached: z.infer<typeof configSchema> | null = null;
try {
  cached = parseConfig(process.env);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

export const config = cached!;
export type Config = z.infer<typeof configSchema>;
