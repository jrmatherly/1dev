import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    throw new Error("Database not connected. Call connectDatabase() first.");
  }
  return db;
}

export async function connectDatabase(): Promise<void> {
  pool = new Pool({ connectionString: config.DATABASE_URL });
  // Verify connectivity
  const client = await pool.connect();
  client.release();
  db = drizzle(pool, { schema });
}

export async function runMigrations(): Promise<void> {
  if (!db) {
    throw new Error("Database not connected. Call connectDatabase() first.");
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

/** Check if the database is reachable (used by health endpoint). */
export async function isDatabaseHealthy(): Promise<boolean> {
  if (!pool) return false;
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}
