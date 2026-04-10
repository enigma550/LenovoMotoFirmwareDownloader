import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withConnectedDeviceConnection } from '../../../../device/connected-device-facade.ts';
import type { ConnectedDeviceConnection } from '../../../../device/device-transport-types.ts';
import { ensureLocalArtifactExists } from '../shared/runtime-artifacts.ts';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_DEX_NAME = 'system_prompt_helper.dex';
const REMOTE_ROOT = '/data/local/tmp/lmfd-system-prompts';
async function ensureLocalDexExists() {
  return ensureLocalArtifactExists(MODULE_DIR, LOCAL_DEX_NAME);
}

type ReadableByteStreamLike = {
  getReader(): {
    read(): Promise<
      { done: true; value?: undefined } | { done: false; value: Uint8Array<ArrayBufferLike> }
    >;
    releaseLock(): void;
  };
};

async function readStreamAsText(stream: ReadableByteStreamLike) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  output += decoder.decode();
  return output;
}

async function runShellCommandOnConnection(
  connection: ConnectedDeviceConnection,
  shellArgs: string[],
  timeoutMs = 30_000,
) {
  const abortController = new AbortController();
  const process = await connection.adb.subprocess.noneProtocol.spawn(
    shellArgs,
    abortController.signal,
  );

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      abortController.abort(new Error('ADB shell command timed out.'));
      void Promise.resolve(process.kill()).catch(() => {});
    }, timeoutMs);
  }

  try {
    const [output] = await Promise.all([readStreamAsText(process.output), process.exited]);
    return output;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function pushFileOnConnection(
  connection: ConnectedDeviceConnection,
  localPath: string,
  remotePath: string,
) {
  const sync = await connection.adb.sync();
  try {
    await runShellCommandOnConnection(connection, ['mkdir', '-p', dirname(remotePath)], 20_000);
    await sync.write({
      filename: remotePath,
      file: Bun.file(localPath).stream() as never,
    });
  } finally {
    await sync.dispose().catch(() => {});
  }
}

async function runPromptHelper(args: string[], connection?: ConnectedDeviceConnection) {
  const localDexPath = await ensureLocalDexExists();
  const remoteDexPath = `${REMOTE_ROOT}/${basename(localDexPath)}`;
  const invoke = async (activeConnection: ConnectedDeviceConnection) => {
    await runShellCommandOnConnection(activeConnection, ['mkdir', '-p', REMOTE_ROOT], 20_000);
    await pushFileOnConnection(activeConnection, localDexPath, remoteDexPath);
    const command = `CLASSPATH=${remoteDexPath} app_process / lmfd.prompt.SystemPromptHelper ${args.join(' ')}`;
    return runShellCommandOnConnection(activeConnection, ['sh', '-c', command], 30_000);
  };

  if (connection) {
    return invoke(connection);
  }

  return withConnectedDeviceConnection(invoke, {
    label: `system-prompt:${args[0] || 'unknown'}`,
  });
}

export async function promptDefaultSmsChangeOnDevice(
  packageName: string,
  connection?: ConnectedDeviceConnection,
) {
  const output = await runPromptHelper(['change-default-sms', packageName], connection);
  if (!output.includes('OK')) {
    throw new Error(output.trim() || `Failed to open the default SMS prompt for ${packageName}.`);
  }
}
