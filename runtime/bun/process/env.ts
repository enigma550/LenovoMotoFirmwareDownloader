export type RuntimeProcessEnvMode = 'external-command' | 'inherit' | 'sidecar';

type RuntimeProcessEnvOptions = {
  mode?: RuntimeProcessEnvMode;
  overrides?: Record<string, string | undefined>;
};

const LINUX_LOADER_ENV_KEYS = ['LD_PRELOAD'] as const;
const SIDECAR_ENV_KEYS = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'PYTHONHOME', 'PYTHONPATH'] as const;

function copyProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}

function removeKeys(env: Record<string, string>, keys: readonly string[]): void {
  for (const key of keys) {
    delete env[key];
  }
}

export function createRuntimeProcessEnv(
  options: RuntimeProcessEnvOptions = {},
): Record<string, string> {
  const env = copyProcessEnv();
  const mode = options.mode ?? 'inherit';

  if (mode === 'external-command') {
    removeKeys(env, LINUX_LOADER_ENV_KEYS);
  }

  if (mode === 'sidecar') {
    removeKeys(env, SIDECAR_ENV_KEYS);
  }

  for (const [key, value] of Object.entries(options.overrides ?? {})) {
    if (typeof value === 'string') {
      env[key] = value;
      continue;
    }
    delete env[key];
  }

  return env;
}
