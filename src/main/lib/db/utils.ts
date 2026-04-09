import { randomBytes } from "node:crypto";

/**
 * Generate a unique ID (cuid-like) using cryptographically secure randomness.
 * Used as database primary keys across all tables.
 */
export function createId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(6).toString("base64url").substring(0, 8);
  return `${timestamp}${randomPart}`;
}
