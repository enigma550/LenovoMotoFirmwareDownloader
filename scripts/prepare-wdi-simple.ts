import { existsSync } from "node:fs";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

type TargetArch = "x64" | "arm64";
type TargetPlatform = "win32" | "darwin" | "linux";

const repoRoot = process.cwd();
const wdiSourceRef = (
  Bun.env.WDI_SIMPLE_SOURCE_REF ||
  process.env.WDI_SIMPLE_SOURCE_REF ||
  "v1.5.1"
).trim();
const skipPrepare =
  (Bun.env.WDI_SIMPLE_SKIP_PREPARE || process.env.WDI_SIMPLE_SKIP_PREPARE || "")
    .trim()
    .toLowerCase() === "1";

function normalizeTargetPlatform(): TargetPlatform {
  const rawOs = (
    Bun.env.ELECTROBUN_OS ||
    process.env.ELECTROBUN_OS ||
    process.platform
  )
    .trim()
    .toLowerCase();

  if (rawOs === "mac" || rawOs === "darwin") {
    return "darwin";
  }

  if (rawOs === "win" || rawOs === "windows" || rawOs === "win32") {
    return "win32";
  }

  if (rawOs === "linux") {
    return "linux";
  }

  throw new Error(`[WDI] Unsupported target OS: ${rawOs}`);
}

function normalizeTargetArch(): TargetArch {
  const rawArch = (
    Bun.env.ELECTROBUN_ARCH ||
    process.env.ELECTROBUN_ARCH ||
    process.arch
  )
    .trim()
    .toLowerCase();

  if (rawArch === "x64" || rawArch === "amd64") {
    return "x64";
  }

  if (rawArch === "arm64" || rawArch === "aarch64") {
    return "arm64";
  }

  throw new Error(`[WDI] Unsupported target arch: ${rawArch}`);
}

function resolvePowerShellCommand() {
  if (process.platform === "win32") {
    return "powershell";
  }

  return "pwsh";
}

function runCommand(command: string, args: string[]) {
  console.log(`[WDI] Running: ${command} ${args.join(" ")}`);
  const result = Bun.spawnSync([command, ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`[WDI] Command failed: ${command} ${args.join(" ")}`);
  }
}

async function copyPrebuiltBinary(options: {
  outputPath: string;
  prebuiltPath: string;
}) {
  const resolvedPrebuiltPath = resolve(options.prebuiltPath);
  const prebuiltFile = Bun.file(resolvedPrebuiltPath);
  if (!(await prebuiltFile.exists())) {
    throw new Error(
      `[WDI] Prebuilt wdi-simple binary not found: ${resolvedPrebuiltPath}`,
    );
  }

  await cp(resolvedPrebuiltPath, options.outputPath, { force: true });
}

async function buildOnWindowsHost(options: {
  outputPath: string;
  targetArch: TargetArch;
  sourceRef: string;
}) {
  if (process.platform !== "win32") {
    throw new Error(
      "[WDI] Windows host required to build wdi-simple from source. " +
        "Use WDI_SIMPLE_PREBUILT_PATH or run this step on Windows.",
    );
  }

  const buildScriptPath = resolve(
    repoRoot,
    "scripts",
    "build-wdi-simple-windows.ps1",
  );
  const workDir = resolve(
    repoRoot,
    "build",
    `wdi-simple-${options.targetArch}`,
  );
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  runCommand(resolvePowerShellCommand(), [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    buildScriptPath,
    "-OutputPath",
    options.outputPath,
    "-WorkDir",
    workDir,
    "-TargetArch",
    options.targetArch,
    "-SourceRef",
    options.sourceRef,
  ]);
}

async function main() {
  if (skipPrepare) {
    console.log(
      "[WDI] Skipping wdi-simple prepare because WDI_SIMPLE_SKIP_PREPARE=1",
    );
    return;
  }

  const targetPlatform = normalizeTargetPlatform();
  if (targetPlatform !== "win32") {
    console.log(
      `[WDI] Skipping wdi-simple prepare for target platform ${targetPlatform}`,
    );
    return;
  }

  const targetArch = normalizeTargetArch();
  const platformArchKey = `${targetPlatform}-${targetArch}`;
  const executableName = "wdi-simple.exe";
  const outputDir = resolve(
    repoRoot,
    "assets",
    "tools",
    "wdi",
    platformArchKey,
  );
  const outputPath = join(outputDir, executableName);
  const prebuiltPath = (
    Bun.env.WDI_SIMPLE_PREBUILT_PATH ||
    process.env.WDI_SIMPLE_PREBUILT_PATH ||
    ""
  ).trim();

  console.log(`[WDI] Preparing bundled wdi-simple for ${platformArchKey}...`);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  if (prebuiltPath) {
    await copyPrebuiltBinary({ outputPath, prebuiltPath });
  } else {
    await buildOnWindowsHost({
      outputPath,
      targetArch,
      sourceRef: wdiSourceRef,
    });
  }

  if (!existsSync(outputPath)) {
    throw new Error("[WDI] Build completed without producing wdi-simple.exe");
  }

  const binaryStats = await stat(outputPath);
  await writeFile(
    join(outputDir, "release.json"),
    JSON.stringify(
      {
        source: "pbatard/libwdi",
        release: wdiSourceRef,
        executable: basename(outputPath),
        bytes: binaryStats.size,
        builtAt: new Date().toISOString(),
        builtBy: prebuiltPath ? "prebuilt-copy" : "windows-source-build",
      },
      null,
      2,
    ),
  );

  console.log(`[WDI] Bundled wdi-simple ready at ${outputPath}`);
}

await main();
