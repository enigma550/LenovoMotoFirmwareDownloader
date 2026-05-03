import { createProcessEnv } from './build-env.ts';

type RunCommandOptions = {
  args: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  label: string;
  stderr?: 'ignore' | 'inherit' | 'pipe';
  stdout?: 'ignore' | 'inherit' | 'pipe';
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function commandExists(command: string, cwd = process.cwd()): boolean {
  const result = Bun.spawnSync(
    ['bash', '-lc', `command -v ${shellQuote(command)} >/dev/null 2>&1`],
    {
      cwd,
      env: createProcessEnv(),
      stderr: 'ignore',
      stdout: 'ignore',
    },
  );

  return result.exitCode === 0;
}

export function runCommand(options: RunCommandOptions): void {
  const result = Bun.spawnSync([options.command, ...options.args], {
    cwd: options.cwd ?? process.cwd(),
    env: createProcessEnv(options.env),
    stderr: options.stderr ?? 'inherit',
    stdout: options.stdout ?? 'inherit',
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr?.toString().trim();
    const stdout = result.stdout?.toString().trim();
    const detail = stderr || stdout;
    throw new Error(
      `[${options.label}] Command failed: ${options.command} ${options.args.join(' ')}${
        detail ? `\n${detail}` : ''
      }`,
    );
  }
}
