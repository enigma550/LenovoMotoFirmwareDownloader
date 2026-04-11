const buildEnv = (process.argv[2] || '').trim().toLowerCase();

if (!buildEnv) {
  console.error(
    'No build environment provided. Usage: bun run tooling/build/run-electrobun-build.ts <dev|canary|stable>',
  );
  process.exit(1);
}

const childEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string') {
    childEnv[key] = value;
  }
}

if (process.platform === 'win32') {
  // PowerShell module autoload for Compress-Archive can fail when Bun forwards
  // the current PSModulePath into Electrobun's child PowerShell process.
  delete childEnv.PSModulePath;
}

const command = [process.execPath, 'x', 'electrobun', 'build', `--env=${buildEnv}`];
const proc = Bun.spawn(command, {
  env: childEnv,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

const exitCode = await proc.exited;
process.exit(exitCode);
