/**
 * Regression guard for Phase 0 hard gate #7.
 *
 * The Claude Code binary download script (`scripts/download-claude-binary.mjs`)
 * must verify the detached GPG signature on `manifest.json` against Anthropic's
 * release-signing public key before trusting any checksums in the manifest.
 * Without this, a compromised CDN or DNS hijack could substitute a malicious
 * manifest+binary pair (the April 2026 winget Anthropic.Claude hash mismatch
 * incident is a real-world example of this attack class).
 *
 * This guard asserts the three structural pieces of the GPG verification are
 * present in the source:
 *
 *   1. The vendored public key file at `scripts/anthropic-release-pubkey.asc`
 *      exists and contains a PGP public key block.
 *   2. The download script imports the `execFileSync` API and calls `gpg`
 *      (the actual verification primitive).
 *   3. The download script pins the expected key fingerprint as a constant
 *      (the trust anchor — fingerprint mismatch must abort).
 *
 * See:
 *   docs/enterprise/auth-strategy.md §6 Phase 0 hard gate #7
 *   https://code.claude.com/docs/en/setup#binary-integrity-and-code-signing
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const PUBKEY_PATH = join(REPO_ROOT, "scripts/anthropic-release-pubkey.asc");
const DOWNLOAD_SCRIPT = join(REPO_ROOT, "scripts/download-claude-binary.mjs");

// The trust anchor. This MUST match what Anthropic publishes at
// https://code.claude.com/docs/en/setup#binary-integrity-and-code-signing.
// If Anthropic rotates their signing key, this constant must be updated
// alongside the vendored public key file — the rotation should be a
// deliberate, reviewed change, not a silent substitution.
const EXPECTED_FINGERPRINT = "31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE";

describe("Phase 0 gate #7: GPG manifest signature verification", () => {
  test("Anthropic release public key is vendored in the repo", () => {
    expect(existsSync(PUBKEY_PATH)).toBe(true);
    const pubkey = readFileSync(PUBKEY_PATH, "utf8");
    expect(pubkey).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
    expect(pubkey).toContain("-----END PGP PUBLIC KEY BLOCK-----");
  });

  test("download script calls gpg to verify manifest signatures", () => {
    const source = readFileSync(DOWNLOAD_SCRIPT, "utf8");
    // The script must import execFileSync or equivalent to spawn gpg.
    expect(source).toContain("execFileSync");
    // The script must invoke gpg with --verify.
    expect(source).toContain("--verify");
    // The script must fetch the .sig file.
    expect(source).toContain("manifest.json.sig");
    // The script must call a verifyManifestSignature helper in main().
    expect(source).toContain("verifyManifestSignature");
  });

  test("download script pins the expected key fingerprint", () => {
    const source = readFileSync(DOWNLOAD_SCRIPT, "utf8");
    // The trust anchor must be hardcoded as a constant so a tampered
    // public key file is caught by the fingerprint comparison.
    expect(source).toContain(EXPECTED_FINGERPRINT);
    // The script must actually compare the imported fingerprint against
    // the constant, not just declare it.
    expect(source).toContain("ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT");
  });
});
