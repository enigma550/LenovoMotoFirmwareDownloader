export type BuildPlatform = 'darwin' | 'linux' | 'win32';
export type BuildArch = 'arm64' | 'ia32' | 'x64';

export type BuildTarget = {
  arch: BuildArch;
  key: string;
  platform: BuildPlatform;
};

type ResolveBuildTargetOptions = {
  allowIa32?: boolean;
  label: string;
};

function readRawEnvValue(name: string, env: Record<string, string | undefined>): string {
  return (Bun.env[name] ?? env[name] ?? '').trim();
}

export function readEnvValue(
  name: string,
  fallback = '',
  env: Record<string, string | undefined> = process.env,
): string {
  return readRawEnvValue(name, env) || fallback;
}

export function readEnvFlag(
  name: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return readRawEnvValue(name, env).toLowerCase() === '1';
}

export function normalizeBuildPlatform(rawValue: string, label: string): BuildPlatform {
  const raw = rawValue.trim().toLowerCase();
  if (raw === 'mac' || raw === 'darwin') return 'darwin';
  if (raw === 'win' || raw === 'windows' || raw === 'win32') return 'win32';
  if (raw === 'linux') return 'linux';
  throw new Error(`[${label}] Unsupported target OS: ${rawValue}`);
}

export function normalizeBuildArch(
  rawValue: string,
  label: string,
  options: { allowIa32?: boolean } = {},
): BuildArch {
  const raw = rawValue.trim().toLowerCase();
  if (raw === 'x64' || raw === 'amd64') return 'x64';
  if (raw === 'arm64' || raw === 'aarch64') return 'arm64';
  if (options.allowIa32 && (raw === 'x86' || raw === 'ia32')) return 'ia32';
  throw new Error(`[${label}] Unsupported target arch: ${rawValue}`);
}

export function resolveBuildTarget(options: ResolveBuildTargetOptions): BuildTarget {
  const platform = normalizeBuildPlatform(
    readEnvValue('ELECTROBUN_OS', process.platform),
    options.label,
  );
  const arch = normalizeBuildArch(readEnvValue('ELECTROBUN_ARCH', process.arch), options.label, {
    allowIa32: options.allowIa32,
  });

  return {
    arch,
    key: `${platform}-${arch}`,
    platform,
  };
}

export function createProcessEnv(
  overrides: Record<string, string | undefined> = {},
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'string') {
      env[key] = value;
      continue;
    }
    delete env[key];
  }

  return env;
}
