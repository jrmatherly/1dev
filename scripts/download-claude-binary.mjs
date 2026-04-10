#!/usr/bin/env node
/**
 * Downloads Claude Code native binaries for bundling with the Electron app.
 *
 * Usage:
 *   node scripts/download-claude-binary.mjs                          # Download for current platform
 *   node scripts/download-claude-binary.mjs --all                    # Download all platforms
 *   node scripts/download-claude-binary.mjs --platform darwin-x64    # Download for specific platform
 *   node scripts/download-claude-binary.mjs --version=2.1.5          # Specific version
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT_DIR, "resources", "bin");

// Claude Code distribution base URL
const DIST_BASE =
  "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

// Anthropic Claude Code Release Signing public key (vendored at scripts/anthropic-release-pubkey.asc).
// The trust anchor is the fingerprint below — even if the vendored key file is tampered with,
// the fingerprint check after gpg --import will catch the substitution.
//
// Source: https://code.claude.com/docs/en/setup#binary-integrity-and-code-signing
// Key URL (for refresh): https://downloads.claude.ai/keys/claude-code.asc
// Manifest signatures available since Claude Code 2.1.89.
const ANTHROPIC_RELEASE_PUBKEY_PATH = path.join(
  __dirname,
  "anthropic-release-pubkey.asc",
);
const ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT =
  "31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE";
const ANTHROPIC_RELEASE_SIGNING_UID =
  "Anthropic Claude Code Release Signing <security@anthropic.com>";

// First Claude Code version that publishes a detached signature alongside manifest.json.
// Versions older than this are accepted with a warning (graceful degradation).
const FIRST_SIGNED_VERSION = [2, 1, 89];

// Platform mappings
const PLATFORMS = {
  "darwin-arm64": { dir: "darwin-arm64", binary: "claude" },
  "darwin-x64": { dir: "darwin-x64", binary: "claude" },
  "linux-arm64": { dir: "linux-arm64", binary: "claude" },
  "linux-x64": { dir: "linux-x64", binary: "claude" },
  "win32-arm64": { dir: "win32-arm64", binary: "claude.exe" },
  "win32-x64": { dir: "win32-x64", binary: "claude.exe" },
};

/**
 * Fetch JSON from URL
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchJson(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Pipe an HTTP response to a file with progress reporting.
 */
function handleResponse(res, file, destPath, resolve, reject) {
  const totalSize = Number.parseInt(res.headers["content-length"], 10);
  let downloaded = 0;
  let lastPercent = 0;

  res.on("data", (chunk) => {
    downloaded += chunk.length;
    const percent = Math.floor((downloaded / totalSize) * 100);
    if (percent !== lastPercent && percent % 10 === 0) {
      process.stdout.write(`\r  Progress: ${percent}%`);
      lastPercent = percent;
    }
  });

  res.pipe(file);

  file.on("finish", () => {
    file.close();
    process.stdout.write("\r  Progress: 100%\n");
    resolve();
  });

  res.on("error", (err) => {
    file.close();
    fs.unlinkSync(destPath);
    reject(err);
  });
}

/**
 * Download file with progress
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const request = (nextUrl) => {
      https
        .get(nextUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            file.close();
            fs.unlinkSync(destPath);
            return request(res.headers.location);
          }

          if (res.statusCode !== 200) {
            file.close();
            fs.unlinkSync(destPath);
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          handleResponse(res, file, destPath, resolve, reject);
        })
        .on("error", (err) => {
          file.close();
          fs.unlinkSync(destPath);
          reject(err);
        });
    };

    request(url);
  });
}

/**
 * Calculate SHA256 hash of file
 */
function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Compare two semver-ish [major, minor, patch] arrays.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * Parse a "X.Y.Z" version string into a [major, minor, patch] array.
 * Returns null if the input cannot be parsed.
 */
function parseVersion(versionStr) {
  const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Download a URL into a Buffer (small files only — manifest + signature).
 */
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          downloadBuffer(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Verify the manifest's detached GPG signature against Anthropic's release-signing
 * public key. The trust anchor is the fingerprint constant
 * ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT — even if the vendored key file is tampered
 * with, the fingerprint check after gpg --import will catch the substitution.
 *
 * Phase 0 hard gate #7: closes the manifest-signature gap that the existing
 * SHA-256 verification (already implemented at downloadPlatform) does not cover.
 * Without this, a compromised CDN or DNS hijack could substitute a malicious
 * manifest+binary pair (the April 2026 winget Anthropic.Claude hash mismatch
 * incident is a real-world example of this attack class).
 *
 * Returns nothing on success. Throws on any failure (missing gpg, missing key,
 * fingerprint mismatch, signature verification failure).
 */
async function verifyManifestSignature(version, manifestBytes) {
  // Check whether this version is expected to ship a signed manifest at all.
  const parsed = parseVersion(version);
  if (parsed === null) {
    console.warn(
      `  ⚠ Could not parse version "${version}" — skipping signature verification`,
    );
    return;
  }
  if (compareVersion(parsed, FIRST_SIGNED_VERSION) < 0) {
    console.warn(
      `  ⚠ Version ${version} predates 2.1.89 — no detached signature published. SHA-256 verification still applies.`,
    );
    return;
  }

  // Confirm gpg is available before we waste cycles fetching anything.
  try {
    execFileSync("gpg", ["--version"], { stdio: "pipe" });
  } catch {
    throw new Error(
      "gpg is not installed or not on PATH. Install GnuPG (https://gnupg.org/) and retry. " +
        "On macOS: 'brew install gnupg'. On Debian/Ubuntu: 'sudo apt install gnupg'.",
    );
  }

  // Confirm the vendored public key file exists.
  if (!fs.existsSync(ANTHROPIC_RELEASE_PUBKEY_PATH)) {
    throw new Error(
      `Anthropic release public key not found at ${ANTHROPIC_RELEASE_PUBKEY_PATH}. ` +
        "This file should be vendored in the repo. If it was deleted, restore it from git " +
        "or refetch from https://downloads.claude.ai/keys/claude-code.asc and verify the " +
        `fingerprint matches ${ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT}.`,
    );
  }

  // Fetch the detached signature from the same release URL.
  const sigUrl = `${DIST_BASE}/${version}/manifest.json.sig`;
  console.log(`  Fetching manifest signature: ${sigUrl}`);
  let sigBytes;
  try {
    sigBytes = await downloadBuffer(sigUrl);
  } catch (err) {
    throw new Error(
      `Failed to download manifest signature for ${version}: ${err.message}. ` +
        "If this version is older than 2.1.89, signature verification can be skipped " +
        "(but only after manually confirming you trust the release).",
    );
  }

  // Use a per-run ephemeral GPG home so we don't pollute the user's ~/.gnupg.
  // We set GNUPGHOME as an env var instead of using --homedir because on
  // Windows CI (Git Bash), fs.mkdtempSync returns a Windows path that gets
  // mangled when passed as a --homedir argument through bash, producing
  // invalid paths like "/d/a/repo/C:\\Users\\...". GNUPGHOME avoids this.
  const gpgHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-gpg-verify-"));
  const gpgEnv = { ...process.env, GNUPGHOME: gpgHome };
  try {
    // Set strict permissions to silence "unsafe permissions" warnings.
    // On Windows, chmod is a no-op but doesn't error.
    fs.chmodSync(gpgHome, 0o700);

    // Import the vendored public key into the ephemeral keyring.
    execFileSync(
      "gpg",
      ["--import", ANTHROPIC_RELEASE_PUBKEY_PATH],
      { stdio: "pipe", env: gpgEnv },
    );

    // Verify the imported key fingerprint matches the hardcoded constant.
    // This catches both "we vendored the wrong key" and "the vendored key file got
    // tampered with after import."
    const fingerprintOutput = execFileSync(
      "gpg",
      [
        "--with-colons",
        "--fingerprint",
        "security@anthropic.com",
      ],
      { stdio: "pipe", env: gpgEnv },
    ).toString();

    // Parse `gpg --with-colons` output: lines starting with "fpr:" contain
    // the fingerprint in field 10. See gpg(1) DETAILS section.
    const fprLine = fingerprintOutput
      .split("\n")
      .find((l) => l.startsWith("fpr:"));
    if (!fprLine) {
      throw new Error(
        "gpg --fingerprint did not return a fingerprint line. " +
          "The vendored public key may be corrupted.",
      );
    }
    const importedFingerprint = fprLine.split(":")[9];
    if (importedFingerprint !== ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT) {
      throw new Error(
        `Vendored public key fingerprint ${importedFingerprint} does NOT match ` +
          `expected ${ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT}. The key may have been ` +
          "tampered with. Refetch from https://downloads.claude.ai/keys/claude-code.asc " +
          "and verify the fingerprint matches Anthropic's published value.",
      );
    }

    // Write the manifest and signature to temp files for gpg --verify.
    const manifestPath = path.join(gpgHome, "manifest.json");
    const sigPath = path.join(gpgHome, "manifest.json.sig");
    fs.writeFileSync(manifestPath, manifestBytes);
    fs.writeFileSync(sigPath, sigBytes);

    // Verify the detached signature. gpg exits non-zero on any verification failure,
    // which execFileSync converts into a thrown exception — so a successful return
    // means the signature is valid.
    try {
      execFileSync(
        "gpg",
        ["--verify", sigPath, manifestPath],
        { stdio: "pipe", env: gpgEnv },
      );
    } catch (err) {
      const stderr = (err.stderr || Buffer.alloc(0)).toString();
      throw new Error(
        `Manifest signature verification FAILED for ${version}.\n` +
          `gpg output:\n${stderr}\n` +
          "This means the manifest may have been tampered with. Do NOT trust the binary.",
      );
    }

    console.log(
      `  ✓ Manifest signature verified (key ${ANTHROPIC_RELEASE_PUBKEY_FINGERPRINT.slice(-16)}, "${ANTHROPIC_RELEASE_SIGNING_UID}")`,
    );
  } finally {
    // Always clean up the ephemeral GPG home.
    try {
      fs.rmSync(gpgHome, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  }
}

/**
 * Get latest version from GCS bucket
 */
async function getLatestVersion() {
  console.log("Fetching latest Claude Code version...");

  try {
    // Fetch from the same endpoint that install.sh uses
    const response = await fetch(
      "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/latest",
    );
    if (response.ok) {
      const version = await response.text();
      return version.trim();
    }
  } catch (error) {
    console.warn(`Failed to fetch latest version: ${error.message}`);
  }

  // Fallback to known version (should be updated periodically)
  return "2.1.45";
}

/**
 * Download binary for a specific platform
 */
async function downloadPlatform(version, platformKey, manifest) {
  const platform = PLATFORMS[platformKey];
  if (!platform) {
    console.error(`Unknown platform: ${platformKey}`);
    return false;
  }

  const targetDir = path.join(BIN_DIR, platformKey);
  const targetPath = path.join(targetDir, platform.binary);

  // Create directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Get expected hash from manifest
  const platformManifest = manifest.platforms[platform.dir];
  if (!platformManifest) {
    console.error(`No manifest entry for ${platform.dir}`);
    return false;
  }

  const expectedHash = platformManifest.checksum;
  const downloadUrl = `${DIST_BASE}/${version}/${platform.dir}/${platform.binary}`;

  console.log(`\nDownloading Claude Code for ${platformKey}...`);
  console.log(`  URL: ${downloadUrl}`);
  console.log(`  Size: ${(platformManifest.size / 1024 / 1024).toFixed(1)} MB`);

  // Check if already downloaded with correct hash
  if (fs.existsSync(targetPath)) {
    const existingHash = await calculateSha256(targetPath);
    if (existingHash === expectedHash) {
      console.log(`  Already downloaded and verified`);
      return true;
    }
    console.log(`  Existing file has wrong hash, re-downloading...`);
  }

  // Download
  await downloadFile(downloadUrl, targetPath);

  // Verify hash
  const actualHash = await calculateSha256(targetPath);
  if (actualHash !== expectedHash) {
    console.error(`  Hash mismatch!`);
    console.error(`    Expected: ${expectedHash}`);
    console.error(`    Actual:   ${actualHash}`);
    fs.unlinkSync(targetPath);
    return false;
  }
  console.log(`  Verified SHA256: ${actualHash.substring(0, 16)}...`);

  // Make executable (Unix)
  if (process.platform !== "win32") {
    fs.chmodSync(targetPath, 0o755); // NOSONAR — standard executable permissions for CLI binary
  }

  console.log(`  Saved to: ${targetPath}`);
  return true;
}

/**
 * Main entry point
 */
function resolvePlatforms(downloadAll, specifiedPlatform) {
  const supported = Object.keys(PLATFORMS);
  if (downloadAll) {
    return supported;
  }
  if (specifiedPlatform) {
    if (!PLATFORMS[specifiedPlatform]) {
      console.error(`Unsupported platform: ${specifiedPlatform}`);
      console.log(`Supported platforms: ${supported.join(", ")}`);
      process.exit(1);
    }
    return [specifiedPlatform];
  }
  const currentPlatform = `${process.platform}-${process.arch}`;
  if (!PLATFORMS[currentPlatform]) {
    console.error(`Unsupported platform: ${currentPlatform}`);
    console.log(`Supported platforms: ${supported.join(", ")}`);
    process.exit(1);
  }
  return [currentPlatform];
}

async function main() {
  const args = process.argv.slice(2);
  const downloadAll = args.includes("--all");
  const versionArg = args.find((a) => a.startsWith("--version="));
  const specifiedVersion = versionArg?.split("=")[1];
  const platformArgIdx = args.indexOf("--platform");
  const platformArgEq = args.find((a) => a.startsWith("--platform="));
  let specifiedPlatform = null;
  if (platformArgEq) {
    specifiedPlatform = platformArgEq.split("=")[1];
  } else if (platformArgIdx >= 0) {
    specifiedPlatform = args[platformArgIdx + 1];
  }

  console.log("Claude Code Binary Downloader");
  console.log("=============================\n");

  // Get version
  const version = specifiedVersion || (await getLatestVersion());
  console.log(`Version: ${version}`);

  // Fetch manifest as raw bytes — we need the exact bytes that were signed
  // for GPG verification, so we cannot go through fetchJson() which parses
  // the body as JSON before we see it.
  const manifestUrl = `${DIST_BASE}/${version}/manifest.json`;
  console.log(`Fetching manifest: ${manifestUrl}`);

  let manifestBytes;
  let manifest;
  try {
    manifestBytes = await downloadBuffer(manifestUrl);
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    console.error(`Failed to fetch manifest: ${error.message}`);
    process.exit(1);
  }

  // Verify the manifest's detached GPG signature before trusting any of its
  // contents. Phase 0 hard gate #7 (enterprise auth strategy v2.1 §6).
  // Throws on any failure — abort hard rather than fall back to unverified.
  try {
    await verifyManifestSignature(version, manifestBytes);
  } catch (error) {
    console.error(`\n✗ ${error.message}\n`);
    process.exit(1);
  }

  const platformsToDownload = resolvePlatforms(downloadAll, specifiedPlatform);

  console.log(`\nPlatforms to download: ${platformsToDownload.join(", ")}`);

  // Create bin directory
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // Write version file
  fs.writeFileSync(
    path.join(BIN_DIR, "VERSION"),
    `${version}\n${new Date().toISOString()}\n`,
  );

  // Download each platform
  let success = true;
  for (const platform of platformsToDownload) {
    const result = await downloadPlatform(version, platform, manifest);
    if (!result) success = false;
  }

  if (success) {
    console.log("\n✓ All downloads completed successfully!");
  } else {
    console.error("\n✗ Some downloads failed");
    process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  console.error("Fatal error:", error);
  process.exit(1);
}
