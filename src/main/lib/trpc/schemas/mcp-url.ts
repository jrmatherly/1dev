/**
 * MCP Server URL validation schema with SSRF protection.
 *
 * Uses Zod 4's `z.httpUrl()` (restricts to http/https schemes) plus a custom
 * refinement that blocks:
 *  - Loopback addresses (127.0.0.0/8, ::1)
 *  - RFC1918 private networks (10/8, 172.16/12, 192.168/16)
 *  - Link-local / cloud metadata endpoints (169.254.0.0/16, metadata.*)
 *  - IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
 *  - IPv4-mapped IPv6 (::ffff:x.x.x.x)
 *  - Hostnames like "localhost", ".local", ".internal"
 *
 * The URL is consumed by the Claude Agent SDK (main process HTTP fetches
 * during OAuth discovery) and the Codex CLI (subprocess HTTP requests).
 * Without this validation, a crafted URL could enable SSRF against cloud
 * metadata endpoints, private networks, or local services.
 *
 * Node's `new URL()` normalizes IP shorthand (`http://127.1/` → `127.0.0.1`,
 * `http://2130706433/` → `127.0.0.1`), so the hostname check is applied to
 * the NORMALIZED hostname extracted by the URL constructor.
 */
import net from "node:net"
import { z } from "zod"

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.internal",
  "metadata.google.internal",
])

const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost"]

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false
  const [a, b] = parts
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local / IMDS
  if (a === 0) return true // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

function isBlockedIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "")
  if (ip === "::1" || ip === "::") return true
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true // fc00::/7 ULA
  if (ip.startsWith("fe80:")) return true // fe80::/10 link-local
  if (ip.startsWith("::ffff:")) {
    const tail = ip.slice(7)
    if (tail.includes(".")) return isBlockedIPv4(tail)
    const m = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (m) {
      const hi = parseInt(m[1], 16)
      const lo = parseInt(m[2], 16)
      return isBlockedIPv4(
        `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
      )
    }
  }
  return false
}

/**
 * Validates a URL intended for an MCP HTTP server.
 * - Only http/https schemes allowed
 * - No loopback, private networks, or metadata endpoints
 */
export const mcpServerUrlSchema = z
  .httpUrl()
  .refine(
    (s) => {
      let u: URL
      try {
        u = new URL(s)
      } catch {
        return false
      }
      const host = u.hostname.toLowerCase()
      const bare = host.replace(/^\[|\]$/g, "")
      if (BLOCKED_HOSTNAMES.has(host)) return false
      if (BLOCKED_SUFFIXES.some((suf) => host.endsWith(suf))) return false
      const kind = net.isIP(bare)
      if (kind === 4 && isBlockedIPv4(bare)) return false
      if (kind === 6 && isBlockedIPv6(bare)) return false
      return true
    },
    {
      message:
        "URL must be a public http(s) URL (loopback, private networks, and metadata hosts are not allowed)",
    },
  )
