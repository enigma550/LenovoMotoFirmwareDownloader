import { execSync } from "child_process";

type ExitCodeCarrier = {
  status?: number;
};

function getExitCode(
  error: ExitCodeCarrier | Error | null | undefined,
  fallback = 1,
): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }
  return fallback;
}

function sleepSync(ms: number) {
  const shared = new SharedArrayBuffer(4);
  const view = new Int32Array(shared);
  Atomics.wait(view, 0, 0, ms);
}

function runWithRetries(command: string, attempts: number, sleepMs: number) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execSync(command, { stdio: "inherit" });
      return { ok: true as const, error: null };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        const sleepSeconds = Math.max(1, Math.round(sleepMs / 1000));
        console.warn(
          `[DevLauncher] Command failed (attempt ${attempt}/${attempts}). Retrying in ${sleepSeconds}s...`,
        );
        sleepSync(sleepMs);
      }
    }
  }

  return { ok: false as const, error: lastError };
}

/**
 * launch-dev.ts
 *
 * Starts development mode without running a packaging build.
 */

console.log("\n[DevLauncher] Starting development flow...\n");

// 0. Release ADB lock
// If ADB is running from the build/ folder, it will lock the directory.
console.log("[0/4] Stopping ADB server to release folder locks...");
try {
  execSync("adb kill-server", { stdio: "ignore" });
} catch (e) {
  // Ignore if adb is not in PATH or not running
}

console.log("[1/4] Running formatter and linter");
try {
  execSync("bun run biome:check", { stdio: "inherit" });
} catch (e) {
  process.exit(getExitCode(e as ExitCodeCarrier | Error));
}

console.log("[2/4] Preparing bundled QDL binary for local platform...");
const qdlPrepareResult = runWithRetries("bun run qdl:prepare", 3, 3000);
if (!qdlPrepareResult.ok) {
  console.warn(
    "[DevLauncher] QDL prepare failed after retries. Continuing with existing local QDL assets (if present).",
  );
}

// 1. Build Angular frontend (Always prepare the views)
// This catches syntax errors and updates the /runtime/views folder.
console.log("[3/4] Preparing application views...");
try {
  execSync("bun run prepare:all", { stdio: "inherit" });
} catch (e) {
  console.error(
    "\\n[Error] Angular build failed. Fix the errors and try again.\\n",
  );
  const typedError = e as ExitCodeCarrier | Error;
  process.exit(getExitCode(typedError));
}

// 3. Launch the application instance
console.log("[4/4] Launching application...\n");
try {
  execSync("bunx electrobun dev", {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTROBUN_SKIP_POSTPACKAGE: "1",
    },
  });
} catch {
  console.error("\n[Fatal] Application failed to launch.");
  process.exit(1);
}
