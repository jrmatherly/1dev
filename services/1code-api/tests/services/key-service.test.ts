/**
 * Task 8.5 — key-service unit tests
 *
 * Covers the pure-function helpers (_computeStatus, _daysUntilExpiry,
 * _makeKeyPreview) with explicit 5-state boundary assertions per Decision 9.
 *
 * The full list/create/rotate/revoke operations hit the DB and are covered
 * by integration tests (8.10–8.12); this file asserts the pure status
 * derivation logic that drives the 1Code desktop app's in-app notifications.
 */
import { describe, test, expect } from "bun:test";
import {
  _computeStatus,
  _daysUntilExpiry,
  _makeKeyPreview,
} from "../../src/services/key-service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-04-11T00:00:00.000Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

// ---- _computeStatus boundary tests ---------------------------------------

describe("_computeStatus — Decision 9 five-state semantics", () => {
  test("days_until_expiry = 15 → active", () => {
    expect(_computeStatus("active", daysFromNow(15), NOW)).toBe("active");
  });

  test("days_until_expiry = 14 → expiring_soon (inclusive boundary)", () => {
    expect(_computeStatus("active", daysFromNow(14), NOW)).toBe(
      "expiring_soon",
    );
  });

  test("days_until_expiry = 1 → expiring_soon", () => {
    expect(_computeStatus("active", daysFromNow(1), NOW)).toBe("expiring_soon");
  });

  test("days_until_expiry = 0 → expired", () => {
    expect(_computeStatus("active", daysFromNow(0), NOW)).toBe("expired");
  });

  test("days_until_expiry = -5 → expired", () => {
    expect(_computeStatus("active", daysFromNow(-5), NOW)).toBe("expired");
  });

  test("persisted_status = revoked overrides all (even non-expired)", () => {
    expect(_computeStatus("revoked", daysFromNow(100), NOW)).toBe("revoked");
  });

  test("persisted_status = revoked overrides all (even expired)", () => {
    expect(_computeStatus("revoked", daysFromNow(-5), NOW)).toBe("revoked");
  });

  test("persisted_status = rotated overrides all", () => {
    expect(_computeStatus("rotated", daysFromNow(100), NOW)).toBe("rotated");
  });

  test("persisted_status = rotated overrides expired", () => {
    expect(_computeStatus("rotated", daysFromNow(-5), NOW)).toBe("rotated");
  });
});

// ---- _daysUntilExpiry -----------------------------------------------------

describe("_daysUntilExpiry", () => {
  test("returns positive integer for future dates", () => {
    expect(_daysUntilExpiry(daysFromNow(10), NOW)).toBe(10);
  });

  test("returns 0 at expiry", () => {
    expect(_daysUntilExpiry(NOW, NOW)).toBe(0);
  });

  test("returns negative for past dates", () => {
    expect(_daysUntilExpiry(daysFromNow(-3), NOW)).toBe(-3);
  });

  test("handles sub-day precision with Math.floor", () => {
    // 1.5 days ahead → floor → 1
    const t = new Date(NOW.getTime() + DAY_MS + DAY_MS / 2);
    expect(_daysUntilExpiry(t, NOW)).toBe(1);
  });
});

// ---- _makeKeyPreview ------------------------------------------------------

describe("_makeKeyPreview", () => {
  test("masks middle of a normal key", () => {
    expect(_makeKeyPreview("sk-abcdef123456ghij")).toBe("sk-a...ghij");
  });

  test("returns short keys unchanged", () => {
    expect(_makeKeyPreview("sk-short")).toBe("sk-short");
  });

  test("returns empty string unchanged", () => {
    expect(_makeKeyPreview("")).toBe("");
  });

  test("exactly 8 chars → unchanged (boundary)", () => {
    expect(_makeKeyPreview("12345678")).toBe("12345678");
  });

  test("9 chars → masked", () => {
    expect(_makeKeyPreview("123456789")).toBe("1234...6789");
  });
});
