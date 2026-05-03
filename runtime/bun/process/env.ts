export type RuntimeProcessEnvMode = 'external-command' | 'inherit' | 'sidecar';

type RuntimeProcessEnvOptions = {
  mode?: RuntimeProcessEnvMode;
  overrides?: Record<string, string | undefined>;
};

const HOST_APP_ENV_KEYS = [
  'APPDIR',
  'APPIMAGE',
  'APPIMAGE_SILENT_INSTALL',
  'ARGV0',
  'ELECTROBUN_BUILD_ENV',
  'LE_MOTO_AUTH_RENDERER',
  'LE_MOTO_RENDERER_LINUX',
] as const;
const DYNAMIC_LINKER_ENV_KEYS = [
  'DYLD_FALLBACK_FRAMEWORK_PATH',
  'DYLD_FALLBACK_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'LD_AUDIT',
  'LD_DEBUG',
  'LD_LIBRARY_PATH',
  'LD_ORIGIN_PATH',
  'LD_PRELOAD',
] as const;
const DESKTOP_TOOLKIT_ENV_KEYS = [
  'GDK_PIXBUF_MODULE_FILE',
  'GDK_PIXBUF_MODULEDIR',
  'GIO_EXTRA_MODULES',
  'GIO_MODULE_DIR',
  'GI_TYPELIB_PATH',
  'GTK_DATA_PREFIX',
  'GTK_EXE_PREFIX',
  'GTK_PATH',
  'QML2_IMPORT_PATH',
  'QT_PLUGIN_PATH',
  'QT_QPA_PLATFORM_PLUGIN_PATH',
] as const;
const PYTHON_ENV_KEYS = ['PYTHONHOME', 'PYTHONPATH'] as const;
const EXTERNAL_COMMAND_ENV_KEYS = [
  ...HOST_APP_ENV_KEYS,
  ...DYNAMIC_LINKER_ENV_KEYS,
  ...DESKTOP_TOOLKIT_ENV_KEYS,
  ...PYTHON_ENV_KEYS,
] as const;
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
    removeKeys(env, EXTERNAL_COMMAND_ENV_KEYS);
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
