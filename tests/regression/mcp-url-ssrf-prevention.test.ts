/**
 * Regression guard: mcpServerUrlSchema SSRF prevention
 *
 * Validates that the MCP server URL validation schema correctly blocks
 * SSRF vectors: loopback, private networks, metadata endpoints, and
 * dangerous hostname patterns.
 *
 * Source: src/main/lib/trpc/schemas/mcp-url.ts
 * OpenSpec: security-hardening-and-quality-remediation task 6.5
 */
import { describe, expect, test } from "bun:test";
import { mcpServerUrlSchema } from "../../src/main/lib/trpc/schemas/mcp-url";

// Helper: returns true if the URL passes validation
const isAllowed = (url: string): boolean =>
  mcpServerUrlSchema.safeParse(url).success;

describe("mcpServerUrlSchema — SSRF prevention", () => {
  // ── Public URLs (should PASS) ──────────────────────────────────
  test("allows valid public HTTPS URLs", () => {
    expect(isAllowed("https://mcp.example.com/v1")).toBe(true);
    expect(isAllowed("https://api.openai.com/mcp")).toBe(true);
    expect(isAllowed("https://cdn.jsdelivr.net/mcp")).toBe(true);
  });

  // Note: Zod 4's z.httpUrl() rejects bare IP addresses entirely
  // (enforces hostname with TLD). This means IP-based SSRF vectors
  // are blocked at the schema level before the custom refinement runs.
  test("rejects bare IP addresses (Zod httpUrl restriction)", () => {
    expect(isAllowed("https://93.184.216.34/mcp")).toBe(false);
    expect(isAllowed("http://8.8.8.8/dns")).toBe(false);
  });

  test("allows valid public HTTP URLs", () => {
    expect(isAllowed("http://mcp.example.com:8080/v1")).toBe(true);
  });

  // ── Scheme restrictions (should FAIL) ──────────────────────────
  test("blocks non-http(s) schemes", () => {
    expect(isAllowed("ftp://mcp.example.com/v1")).toBe(false);
    expect(isAllowed("file:///etc/passwd")).toBe(false);
    expect(isAllowed("javascript:alert(1)")).toBe(false);
    expect(isAllowed("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  // ── Loopback addresses (should FAIL) ───────────────────────────
  test("blocks localhost hostname", () => {
    expect(isAllowed("https://localhost/mcp")).toBe(false);
    expect(isAllowed("https://localhost:3000/mcp")).toBe(false);
  });

  test("blocks 127.0.0.0/8 loopback IPs", () => {
    expect(isAllowed("http://127.0.0.1/mcp")).toBe(false);
    expect(isAllowed("http://127.1.2.3:8080/mcp")).toBe(false);
  });

  test("blocks IPv6 loopback (::1)", () => {
    expect(isAllowed("http://[::1]/mcp")).toBe(false);
    expect(isAllowed("http://[::1]:3000/mcp")).toBe(false);
  });

  // ── RFC1918 private networks (should FAIL) ─────────────────────
  test("blocks 10.0.0.0/8 private range", () => {
    expect(isAllowed("http://10.0.0.1/mcp")).toBe(false);
    expect(isAllowed("http://10.255.255.255/mcp")).toBe(false);
  });

  test("blocks 172.16.0.0/12 private range", () => {
    expect(isAllowed("http://172.16.0.1/mcp")).toBe(false);
    expect(isAllowed("http://172.31.255.255/mcp")).toBe(false);
  });

  test("blocks 192.168.0.0/16 private range", () => {
    expect(isAllowed("http://192.168.1.1/mcp")).toBe(false);
    expect(isAllowed("http://192.168.0.100:8080/mcp")).toBe(false);
  });

  // ── Cloud metadata endpoints (should FAIL) ─────────────────────
  test("blocks 169.254.0.0/16 link-local / IMDS", () => {
    expect(isAllowed("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowed("http://169.254.0.1/mcp")).toBe(false);
  });

  test("blocks metadata hostnames", () => {
    expect(isAllowed("http://metadata/computeMetadata/v1")).toBe(false);
    expect(isAllowed("http://metadata.internal/mcp")).toBe(false);
    expect(isAllowed("http://metadata.google.internal/mcp")).toBe(false);
  });

  // ── Dangerous hostname suffixes (should FAIL) ──────────────────
  test("blocks .internal / .local / .localhost suffixes", () => {
    expect(isAllowed("http://service.internal/mcp")).toBe(false);
    expect(isAllowed("http://printer.local/mcp")).toBe(false);
    expect(isAllowed("http://app.localhost/mcp")).toBe(false);
  });

  // ── IPv6 special ranges (should FAIL) ──────────────────────────
  test("blocks IPv6 unique-local (fc00::/7)", () => {
    expect(isAllowed("http://[fc00::1]/mcp")).toBe(false);
    expect(isAllowed("http://[fd12:3456::1]/mcp")).toBe(false);
  });

  test("blocks IPv6 link-local (fe80::/10)", () => {
    expect(isAllowed("http://[fe80::1]/mcp")).toBe(false);
  });

  test("blocks IPv4-mapped IPv6 with private IP", () => {
    expect(isAllowed("http://[::ffff:127.0.0.1]/mcp")).toBe(false);
    expect(isAllowed("http://[::ffff:10.0.0.1]/mcp")).toBe(false);
    expect(isAllowed("http://[::ffff:192.168.1.1]/mcp")).toBe(false);
  });

  // ── Other blocked ranges (should FAIL) ─────────────────────────
  test("blocks 0.0.0.0/8", () => {
    expect(isAllowed("http://0.0.0.0/mcp")).toBe(false);
  });

  test("blocks 100.64.0.0/10 CGNAT range", () => {
    expect(isAllowed("http://100.64.0.1/mcp")).toBe(false);
    expect(isAllowed("http://100.127.255.255/mcp")).toBe(false);
  });

  test("blocks multicast / reserved (224+)", () => {
    expect(isAllowed("http://224.0.0.1/mcp")).toBe(false);
    expect(isAllowed("http://255.255.255.255/mcp")).toBe(false);
  });

  // ── Edge cases ─────────────────────────────────────────────────
  test("rejects malformed URLs", () => {
    expect(isAllowed("not-a-url")).toBe(false);
    expect(isAllowed("")).toBe(false);
  });

  // Bare IPs are rejected by z.httpUrl() so boundary tests are
  // not applicable — Zod blocks them before the refinement runs.
  // The refinement logic (isBlockedIPv4/IPv6) is a defense-in-depth
  // layer for any future schema change that might relax the URL format.
});
