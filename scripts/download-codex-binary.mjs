#!/usr/bin/env node
/**
 * Downloads Codex CLI native binaries for bundling with the Electron app.
 *
 * Usage:
 *   node scripts/download-codex-binary.mjs              # Download for current platform
 *   node scripts/download-codex-binary.mjs --all        # Download all platforms
 *   node scripts/download-codex-binary.mjs --version=0.98.0
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT_DIR, "resources", "bin");

const RELEASE_REPO = "openai/codex";
const RELEASE_TAG_PREFIX = "rust-v";
const USER_AGENT = "1code-desktop-codex-downloader";

// Pinned version — mirrors the CODEX_VERSION baked into release.yml / CI.
// When bumping, also regenerate PINNED_HASHES by running locally (outside CI):
//   curl -s "https://api.github.com/repos/openai/codex/releases/tags/rust-v<NEW>" \
//     | jq -r '.assets[] | select(.digest != null) | "  \"\(.name)\": \"\(.digest | sub("^sha256:"; ""))\","'
const PINNED_CODEX_VERSION = "0.118.0";

// SHA256 digests from the GitHub Releases API, captured at pin time.
// These let CI builds skip api.github.com entirely and still verify
// supply-chain integrity against a known-good hash.
//
// Why we don't fetch hashes at runtime in CI:
//   GitHub's unauthenticated api.github.com rate limit is 60 req/hr per IP.
//   macOS-15 runners share IPs across thousands of Actions workflows, so
//   api.github.com requests routinely return HTTP 403 on the first attempt.
//   The binary download itself goes through github.com/.../releases/download,
//   which redirects to Azure blob storage — NOT rate limited by the same
//   mechanism, so we hit it directly.
const PINNED_HASHES = {
  "codex-aarch64-apple-darwin.tar.gz":
    "bad3c2c83b874b767ce86af64f4f005bc14dea79f2d8cac37cfa6eb77710c717",
  "codex-x86_64-apple-darwin.tar.gz":
    "2234b35a4df459730442399368d58404d838e7d56b226f66df1dcb4ea5b431cc",
  "codex-aarch64-unknown-linux-musl.tar.gz":
    "29bc741268b6d17ddd148b8c2c2108e8b3a0eef914b07922491348144e667e09",
  "codex-x86_64-unknown-linux-musl.tar.gz":
    "e707ea65d7bbbc46a04afe731bf3c14a5b77522100cebf8bb93cffb95cf4610b",
  "codex-aarch64-pc-windows-msvc.exe":
    "4badcaf22b9421bd0f96b6bbaf7481f7e65bb1a03991eedd0ec804a25c4bee5a",
  "codex-x86_64-pc-windows-msvc.exe":
    "95b576f0b759d17c4155a66f59e9f3f2e186f2b4602f1199feb8c08ffc67da07",
};

function buildDirectDownloadUrl(version, assetName) {
  return `https://github.com/${RELEASE_REPO}/releases/download/${RELEASE_TAG_PREFIX}${version}/${assetName}`;
}

const PLATFORMS = {
  "darwin-arm64": {
    assetName: "codex-aarch64-apple-darwin.tar.gz",
    extractedBinaryName: "codex-aarch64-apple-darwin",
    outputBinaryName: "codex",
  },
  "darwin-x64": {
    assetName: "codex-x86_64-apple-darwin.tar.gz",
    extractedBinaryName: "codex-x86_64-apple-darwin",
    outputBinaryName: "codex",
  },
  "linux-arm64": {
    assetName: "codex-aarch64-unknown-linux-musl.tar.gz",
    extractedBinaryName: "codex-aarch64-unknown-linux-musl",
    outputBinaryName: "codex",
  },
  "linux-x64": {
    assetName: "codex-x86_64-unknown-linux-musl.tar.gz",
    extractedBinaryName: "codex-x86_64-unknown-linux-musl",
    outputBinaryName: "codex",
  },
  "win32-arm64": {
    assetName: "codex-aarch64-pc-windows-msvc.exe",
    outputBinaryName: "codex.exe",
  },
  "win32-x64": {
    assetName: "codex-x86_64-pc-windows-msvc.exe",
    outputBinaryName: "codex.exe",
  },
};

// Headers for binary downloads. Intentionally does NOT include Authorization —
// sending cross-org Bearer tokens (e.g., a jrmatherly/1dev GITHUB_TOKEN) to
// openai/codex returns HTTP 403, which was the root cause of earlier CI
// failures. Since the binary downloads hit github.com/.../releases/download
// and redirect to Azure blob storage (which ignores auth), omitting
// Authorization is both safe and necessary.
function getDownloadHeaders() {
  return {
    "User-Agent": USER_AGENT,
  };
}

/**
 * Pipe an HTTP response to a file with progress reporting.
 */
function handleResponse(res, file, destPath, resolve, reject) {
  const totalSize = Number.parseInt(res.headers["content-length"] || "0", 10);
  let downloaded = 0;
  let lastPrintedPercent = -1;

  res.on("data", (chunk) => {
    downloaded += chunk.length;
    if (totalSize <= 0) return;

    const percent = Math.floor((downloaded / totalSize) * 100);
    if (percent !== lastPrintedPercent && percent % 10 === 0) {
      process.stdout.write(`\r  Progress: ${percent}%`);
      lastPrintedPercent = percent;
    }
  });

  res.pipe(file);

  file.on("finish", () => {
    file.close();
    if (totalSize > 0) {
      process.stdout.write("\r  Progress: 100%\n");
    }
    resolve();
  });

  res.on("error", (error) => {
    file.close();
    fs.rmSync(destPath, { force: true });
    reject(error);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = (nextUrl) => {
      const file = fs.createWriteStream(destPath);

      https
        .get(nextUrl, { headers: getDownloadHeaders() }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const redirectUrl = res.headers.location;
            if (!redirectUrl) {
              file.close();
              fs.rmSync(destPath, { force: true });
              return reject(new Error("Missing redirect location"));
            }

            file.destroy();
            fs.rmSync(destPath, { force: true });
            request(redirectUrl);
            return;
          }

          if (res.statusCode !== 200) {
            file.close();
            fs.rmSync(destPath, { force: true });
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          handleResponse(res, file, destPath, resolve, reject);
        })
        .on("error", (error) => {
          file.close();
          fs.rmSync(destPath, { force: true });
          reject(error);
        });
    };

    request(url);
  });
}

function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    stream.on("error", reject);
  });
}

function extractTarGz(archivePath, targetDir) {
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", targetDir], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `tar extraction failed with code ${result.status ?? "unknown"}`,
    );
  }
}

function getVersionArg(args) {
  const equalsArg = args.find((arg) => arg.startsWith("--version="));
  if (equalsArg) {
    return equalsArg.slice("--version=".length);
  }

  const index = args.indexOf("--version");
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return null;
}

async function downloadPlatform(version, platformKey) {
  const platform = PLATFORMS[platformKey];
  if (!platform) {
    console.error(`Unknown platform: ${platformKey}`);
    return false;
  }

  const targetDir = path.join(BIN_DIR, platformKey);
  const targetPath = path.join(targetDir, platform.outputBinaryName);
  const hashMarkerPath = path.join(targetDir, ".codex-asset.sha256");

  fs.mkdirSync(targetDir, { recursive: true });

  // Use pinned hash if the requested version matches PINNED_CODEX_VERSION,
  // otherwise skip verification with a warning (non-pinned versions are for
  // local dev only — CI always uses the pinned version).
  const expectedHash =
    version === PINNED_CODEX_VERSION
      ? PINNED_HASHES[platform.assetName] || null
      : null;
  const downloadUrl = buildDirectDownloadUrl(version, platform.assetName);

  console.log(`\nDownloading Codex for ${platformKey}...`);
  console.log(`  URL: ${downloadUrl}`);

  if (
    expectedHash &&
    fs.existsSync(targetPath) &&
    fs.existsSync(hashMarkerPath) &&
    fs.readFileSync(hashMarkerPath, "utf8").trim() === expectedHash
  ) {
    console.log("  Already downloaded and verified");
    return true;
  }

  const downloadPath = path.join(targetDir, `${platform.assetName}.download`);
  fs.rmSync(downloadPath, { force: true });

  await downloadFile(downloadUrl, downloadPath);

  if (expectedHash) {
    const actualHash = await calculateSha256(downloadPath);
    if (actualHash !== expectedHash) {
      console.error("  Hash mismatch!");
      console.error(`    Expected: ${expectedHash}`);
      console.error(`    Actual:   ${actualHash}`);
      fs.rmSync(downloadPath, { force: true });
      return false;
    }
    console.log(`  Verified SHA256: ${actualHash.slice(0, 16)}...`);
  } else {
    console.warn(
      "  Warning: release digest missing, skipping hash verification",
    );
  }

  if (platform.assetName.endsWith(".tar.gz")) {
    const extractDir = path.join(targetDir, ".extract");
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });

    extractTarGz(downloadPath, extractDir);

    const extractedPath = path.join(extractDir, platform.extractedBinaryName);
    if (!fs.existsSync(extractedPath)) {
      fs.rmSync(downloadPath, { force: true });
      fs.rmSync(extractDir, { recursive: true, force: true });
      throw new Error(`Extracted binary not found: ${extractedPath}`);
    }

    fs.copyFileSync(extractedPath, targetPath);
    fs.rmSync(extractDir, { recursive: true, force: true });
  } else {
    fs.copyFileSync(downloadPath, targetPath);
  }

  fs.rmSync(downloadPath, { force: true });

  if (!platformKey.startsWith("win32")) {
    fs.chmodSync(targetPath, 0o755); // NOSONAR — standard executable permissions for CLI binary
  }

  if (expectedHash) {
    fs.writeFileSync(hashMarkerPath, `${expectedHash}\n`);
  }

  console.log(`  Saved to: ${targetPath}`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const downloadAll = args.includes("--all");
  const specifiedVersion = getVersionArg(args);
  const platformArgIdx = args.indexOf("--platform");
  const platformArgEq = args.find((a) => a.startsWith("--platform="));
  let specifiedPlatform = null;
  if (platformArgEq) {
    specifiedPlatform = platformArgEq.split("=")[1];
  } else if (platformArgIdx >= 0) {
    specifiedPlatform = args[platformArgIdx + 1];
  }

  console.log("Codex Binary Downloader");
  console.log("=======================\n");

  const version = specifiedVersion || PINNED_CODEX_VERSION;
  console.log(`Version: ${version}`);

  if (version !== PINNED_CODEX_VERSION) {
    console.warn(
      `  ⚠️ Requested version (${version}) differs from pinned (${PINNED_CODEX_VERSION}).`,
    );
    console.warn(
      "  ⚠️ SHA256 verification will be skipped for non-pinned versions.",
    );
    console.warn(
      "  ⚠️ Update PINNED_CODEX_VERSION + PINNED_HASHES in this script before bumping CI.",
    );
  }

  let platformsToDownload;
  if (downloadAll) {
    platformsToDownload = Object.keys(PLATFORMS);
  } else if (specifiedPlatform) {
    if (!PLATFORMS[specifiedPlatform]) {
      console.error(`Unsupported platform: ${specifiedPlatform}`);
      console.log(`Supported platforms: ${Object.keys(PLATFORMS).join(", ")}`);
      process.exit(1);
    }
    platformsToDownload = [specifiedPlatform];
  } else {
    const currentPlatform = `${process.platform}-${process.arch}`;
    if (!PLATFORMS[currentPlatform]) {
      console.error(`Unsupported platform: ${currentPlatform}`);
      console.log(`Supported platforms: ${Object.keys(PLATFORMS).join(", ")}`);
      process.exit(1);
    }
    platformsToDownload = [currentPlatform];
  }

  console.log(`\nPlatforms to download: ${platformsToDownload.join(", ")}`);

  fs.mkdirSync(BIN_DIR, { recursive: true });

  let success = true;
  for (const platformKey of platformsToDownload) {
    const result = await downloadPlatform(version, platformKey);
    if (!result) {
      success = false;
    }
  }

  if (!success) {
    console.error("\n✗ Some downloads failed");
    process.exit(1);
  }

  console.log("\n✓ All downloads completed successfully!");
}

try {
  await main();
} catch (error) {
  console.error("Fatal error:", error);
  process.exit(1);
}
