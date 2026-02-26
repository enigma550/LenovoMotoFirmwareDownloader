import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = process.cwd();
const qdlRepoWeb = "https://github.com/linux-msm/qdl";
const qdlReleaseTag = (
  Bun.env.QDL_RELEASE_TAG ||
  process.env.QDL_RELEASE_TAG ||
  "latest"
).trim();
const skipPrepare =
  (Bun.env.QDL_SKIP_PREPARE || process.env.QDL_SKIP_PREPARE || "")
    .trim()
    .toLowerCase() === "1";
const downloadAttempts = Number.parseInt(
  (
    Bun.env.QDL_DOWNLOAD_ATTEMPTS ||
    process.env.QDL_DOWNLOAD_ATTEMPTS ||
    "4"
  ).trim(),
  10,
);

if (skipPrepare) {
  console.log("[QDL] Skipping QDL prepare because QDL_SKIP_PREPARE=1");
  process.exit(0);
}

function normalizeTargetPlatform() {
  const rawOs = (
    Bun.env.ELECTROBUN_OS ||
    process.env.ELECTROBUN_OS ||
    process.platform
  ).trim();
  if (rawOs === "mac" || rawOs === "darwin") return "darwin";
  if (rawOs === "win" || rawOs === "windows" || rawOs === "win32")
    return "win32";
  if (rawOs === "linux") return "linux";
  throw new Error(`[QDL] Unsupported target OS: ${rawOs}`);
}

function normalizeTargetArch() {
  const rawArch = (
    Bun.env.ELECTROBUN_ARCH ||
    process.env.ELECTROBUN_ARCH ||
    process.arch
  )
    .trim()
    .toLowerCase();
  if (rawArch === "x64" || rawArch === "amd64") return "x64";
  if (rawArch === "arm64" || rawArch === "aarch64") return "arm64";
  throw new Error(`[QDL] Unsupported target arch: ${rawArch}`);
}

function resolveAssetName(targetPlatform: string, targetArch: string) {
  if (targetPlatform === "darwin") {
    return targetArch === "arm64"
      ? "qdl-binary-macos-arm64.zip"
      : "qdl-binary-macos-intel.zip";
  }

  if (targetPlatform === "win32") {
    return `qdl-binary-windows-${targetArch}.zip`;
  }

  if (targetPlatform === "linux") {
    return `qdl-binary-ubuntu-24-${targetArch}.zip`;
  }

  throw new Error(
    `[QDL] Unsupported platform for asset resolution: ${targetPlatform}`,
  );
}

function runCommand(command: string, args: string[]) {
  const result = Bun.spawnSync([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderrText = result.stderr.toString().trim();
    const stdoutText = result.stdout.toString().trim();
    throw new Error(
      `[QDL] Command failed: ${command} ${args.join(" ")}\n${stderrText || stdoutText || "Unknown error"}`,
    );
  }
}

function shouldRetryStatus(status: number) {
  return (
    status === 403 ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildGitHubHeaders(accept: string) {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "LMFD-qdl-prep",
  };

  const token =
    Bun.env.GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    Bun.env.GH_TOKEN ||
    process.env.GH_TOKEN;
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  return headers;
}

async function fetchWithRetry(options: {
  url: string;
  headers: Record<string, string>;
  label: string;
  attempts?: number;
}) {
  const attempts =
    Number.isFinite(options.attempts) && (options.attempts ?? 0) > 0
      ? Math.trunc(options.attempts as number)
      : 4;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        headers: options.headers,
        redirect: "follow",
      });

      if (response.ok) {
        return response;
      }

      const summary = `${response.status} ${response.statusText}`.trim();
      const retryable = shouldRetryStatus(response.status);
      if (!retryable || attempt >= attempts) {
        throw new Error(
          `[QDL] ${options.label} failed (${summary}) at ${options.url}`,
        );
      }

      const delayMs = attempt * 3000;
      console.warn(
        `[QDL] ${options.label} failed (${summary}), retrying in ${Math.round(delayMs / 1000)}s ` +
          `(attempt ${attempt}/${attempts})...`,
      );
      await wait(delayMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= attempts) {
        break;
      }

      const delayMs = attempt * 3000;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[QDL] ${options.label} request error (${message}), retrying in ${Math.round(delayMs / 1000)}s ` +
          `(attempt ${attempt}/${attempts})...`,
      );
      await wait(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[QDL] ${options.label} failed after ${attempts} attempts.`);
}

async function findFileRecursive(
  rootDir: string,
  fileName: string,
): Promise<string> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileRecursive(fullPath, fileName);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
  }

  return "";
}

async function downloadQdlAsset(targetAssetName: string) {
  const downloadUrl =
    qdlReleaseTag === "latest"
      ? `${qdlRepoWeb}/releases/latest/download/${targetAssetName}`
      : `${qdlRepoWeb}/releases/download/${encodeURIComponent(qdlReleaseTag)}/${targetAssetName}`;

  const response = await fetchWithRetry({
    url: downloadUrl,
    headers: buildGitHubHeaders("application/octet-stream"),
    label: `download ${targetAssetName}`,
    attempts: Number.isFinite(downloadAttempts) ? downloadAttempts : 4,
  });

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`[QDL] Downloaded asset is empty: ${downloadUrl}`);
  }

  return {
    bytes,
    downloadUrl,
  };
}

async function main() {
  const targetPlatform = normalizeTargetPlatform();
  const targetArch = normalizeTargetArch();
  const platformArchKey = `${targetPlatform}-${targetArch}`;
  const targetAssetName = resolveAssetName(targetPlatform, targetArch);
  const executableName = targetPlatform === "win32" ? "qdl.exe" : "qdl";

  console.log(
    `[QDL] Preparing bundled qdl for ${platformArchKey} (${qdlReleaseTag}, asset ${targetAssetName})...`,
  );

  const tempBaseDir = join(
    tmpdir(),
    `lmfd-qdl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const tempZipPath = join(tempBaseDir, targetAssetName);
  const tempExtractDir = join(tempBaseDir, "extract");

  await mkdir(tempExtractDir, { recursive: true });

  console.log(`[QDL] Downloading ${targetAssetName}...`);
  const downloaded = await downloadQdlAsset(targetAssetName);
  await writeFile(tempZipPath, downloaded.bytes);

  if (targetPlatform === "win32") {
    const psCommand = `Expand-Archive -Path '${tempZipPath.replace(/'/g, "''")}' -DestinationPath '${tempExtractDir.replace(/'/g, "''")}' -Force`;
    runCommand("powershell", ["-NoProfile", "-Command", psCommand]);
  } else {
    runCommand("unzip", ["-o", tempZipPath, "-d", tempExtractDir]);
  }

  const discoveredExecutable = await findFileRecursive(
    tempExtractDir,
    executableName,
  );
  if (!discoveredExecutable) {
    throw new Error(
      `[QDL] Extracted archive does not contain ${executableName}.`,
    );
  }

  const outputDir = resolve(
    repoRoot,
    "assets",
    "tools",
    "qdl",
    platformArchKey,
  );
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  await cp(tempExtractDir, outputDir, { recursive: true, force: true });

  const bundledExecutablePath = join(outputDir, executableName);
  if (!existsSync(bundledExecutablePath)) {
    const extractedExecutableBuffer = await readFile(discoveredExecutable);
    await writeFile(
      bundledExecutablePath,
      new Uint8Array(extractedExecutableBuffer),
    );
  }

  if (targetPlatform !== "win32") {
    await chmod(bundledExecutablePath, 0o755);
  }

  await writeFile(
    join(outputDir, "release.json"),
    JSON.stringify(
      {
        source: "linux-msm/qdl",
        release: qdlReleaseTag,
        asset: targetAssetName,
        downloadedAt: new Date().toISOString(),
        downloadUrl: downloaded.downloadUrl,
      },
      null,
      2,
    ),
  );

  await rm(tempBaseDir, { recursive: true, force: true });

  console.log(`[QDL] Bundled qdl ready at ${bundledExecutablePath}`);
}

await main();
