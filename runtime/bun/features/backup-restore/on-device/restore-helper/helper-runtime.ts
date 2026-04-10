import { rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withConnectedDeviceConnection } from '../../../../device/connected-device-facade.ts';
import type { ConnectedDeviceConnection } from '../../../../device/device-transport-types.ts';
import { runCommand } from '../../connected/connected-backups-adb.ts';
import type {
  RestoreContactRecord,
  RestoreMessageRecord,
} from '../../connected/connected-backups-restore-data.ts';
import { ensureLocalArtifactExists } from '../shared/runtime-artifacts.ts';
import { promptDefaultSmsChangeOnDevice } from '../system-prompt/runtime.ts';

type HelperSummary = {
  attempted: number;
  restored: number;
  failed: number;
  detailLines: string[];
  fatal?: string;
};

type SmsRoleState = {
  previousHolders: string[];
  changed: boolean;
};

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_NAME = 'com.github.enigma550.lmfd.restorehelper';
const LOCAL_APK_NAME = 'lmfd_restore_helper.apk';
const REMOTE_INSTALL_DIR = '/data/local/tmp/lmfd-restore-helper';
const REMOTE_ROOT = `/sdcard/Android/data/${PACKAGE_NAME}/files/lmfd`;
const REMOTE_INPUT_DIR = `${REMOTE_ROOT}/inputs`;
const REMOTE_OUTPUT_DIR = `${REMOTE_ROOT}/outputs`;
const SMS_ROLE = 'android.app.role.SMS';

function parseHelperSummary(payload: unknown): HelperSummary {
  const record =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const detailArray = Array.isArray(record.detailLines) ? record.detailLines : [];
  return {
    attempted: typeof record.attempted === 'number' ? record.attempted : 0,
    restored: typeof record.restored === 'number' ? record.restored : 0,
    failed: typeof record.failed === 'number' ? record.failed : 0,
    detailLines: detailArray.map((item) => String(item ?? '')).filter((item) => item.length > 0),
    fatal: typeof record.fatal === 'string' && record.fatal.length > 0 ? record.fatal : undefined,
  };
}

function toJsonFileContent(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function ensureLocalApkExists() {
  return ensureLocalArtifactExists(MODULE_DIR, LOCAL_APK_NAME);
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

async function readRemoteJsonOnConnection(
  connection: ConnectedDeviceConnection,
  remotePath: string,
) {
  const sync = await connection.adb.sync();
  try {
    const stream = sync.read(remotePath);
    return await new Response(stream as never).json();
  } finally {
    await sync.dispose().catch(() => {});
  }
}

async function ensureHelperInstalledOnConnection(connection: ConnectedDeviceConnection) {
  const localApkPath = await ensureLocalApkExists();
  const remoteApkPath = `${REMOTE_INSTALL_DIR}/${basename(localApkPath)}`;

  await runShellCommandOnConnection(connection, ['mkdir', '-p', REMOTE_INSTALL_DIR], 20_000);
  try {
    await pushFileOnConnection(connection, localApkPath, remoteApkPath);
    const installOutput = await runShellCommandOnConnection(
      connection,
      ['pm', 'install', '-r', remoteApkPath],
      180_000,
    );
    if (!/(^|\n)\s*Success\b/i.test(installOutput)) {
      throw new Error(installOutput.trim() || 'Failed to install restore helper APK.');
    }
  } finally {
    await runShellCommandOnConnection(connection, ['rm', '-f', remoteApkPath], 20_000).catch(
      () => {},
    );
  }
}

async function grantPermissionOnConnection(
  connection: ConnectedDeviceConnection,
  permission: string,
) {
  await runShellCommandOnConnection(
    connection,
    ['pm', 'grant', PACKAGE_NAME, permission],
    20_000,
  ).catch(() => {});
}

async function ensureHelperPermissionsOnConnection(connection: ConnectedDeviceConnection) {
  await grantPermissionOnConnection(connection, 'android.permission.READ_CONTACTS');
  await grantPermissionOnConnection(connection, 'android.permission.WRITE_CONTACTS');
  await grantPermissionOnConnection(connection, 'android.permission.READ_SMS');
  await grantPermissionOnConnection(connection, 'android.permission.RECEIVE_SMS');
  await grantPermissionOnConnection(connection, 'android.permission.SEND_SMS');
  await grantPermissionOnConnection(connection, 'android.permission.READ_PHONE_STATE');
}

async function ensureRemoteDirsOnConnection(connection: ConnectedDeviceConnection) {
  await runShellCommandOnConnection(
    connection,
    ['mkdir', '-p', REMOTE_INPUT_DIR, REMOTE_OUTPUT_DIR],
    20_000,
  );
}

async function waitForResultFileOnConnection(
  connection: ConnectedDeviceConnection,
  remoteOutputPath: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const lsOutput = await runShellCommandOnConnection(
        connection,
        ['ls', remoteOutputPath],
        10_000,
      );
      if (lsOutput.includes(basename(remoteOutputPath))) {
        return readRemoteJsonOnConnection(connection, remoteOutputPath);
      }
    } catch {
      // Wait for helper result to appear.
    }
    await Bun.sleep(700);
  }
  throw new Error(`Timed out waiting for helper result: ${remoteOutputPath}`);
}

async function invokeHelper(
  mode: string,
  payload: unknown,
  timeoutMs: number,
  connection?: ConnectedDeviceConnection,
) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const localInputPath = join('/tmp', `lmfd-helper-${mode}-${stamp}.json`);
  const remoteInputPath = `${REMOTE_INPUT_DIR}/${mode}-${stamp}.json`;
  const remoteOutputPath = `${REMOTE_OUTPUT_DIR}/${mode}-${stamp}.json`;

  await writeFile(localInputPath, toJsonFileContent(payload), 'utf8');
  const invoke = async (activeConnection: ConnectedDeviceConnection) => {
    await ensureHelperInstalledOnConnection(activeConnection);
    await ensureHelperPermissionsOnConnection(activeConnection);
    await ensureRemoteDirsOnConnection(activeConnection);
    await pushFileOnConnection(activeConnection, localInputPath, remoteInputPath);

    const startOutput = await runShellCommandOnConnection(
      activeConnection,
      [
        'am',
        'broadcast',
        '-n',
        `${PACKAGE_NAME}/.RestoreCommandReceiver`,
        '--es',
        'mode',
        mode,
        '--es',
        'input',
        remoteInputPath,
        '--es',
        'output',
        remoteOutputPath,
      ],
      Math.max(30_000, timeoutMs),
    );
    if (/^Error:/im.test(startOutput)) {
      throw new Error(startOutput.trim() || `Failed to start helper service for mode ${mode}.`);
    }

    const json = await waitForResultFileOnConnection(activeConnection, remoteOutputPath, timeoutMs);
    return parseHelperSummary(json);
  };

  try {
    if (connection) {
      return await invoke(connection);
    }

    return await withConnectedDeviceConnection(invoke, {
      label: `restore-helper:${mode}`,
    });
  } finally {
    await rm(localInputPath, { force: true }).catch(() => {});
    if (connection) {
      await runShellCommandOnConnection(
        connection,
        ['rm', '-f', remoteInputPath, remoteOutputPath],
        20_000,
      ).catch(() => {});
    } else {
      await withConnectedDeviceConnection(
        async (cleanupConnection) => {
          await runShellCommandOnConnection(
            cleanupConnection,
            ['rm', '-f', remoteInputPath, remoteOutputPath],
            20_000,
          ).catch(() => {});
        },
        { label: `restore-helper:cleanup:${mode}` },
      ).catch(() => {});
    }
  }
}

async function getSmsRoleHolders(connection?: ConnectedDeviceConnection) {
  const result = connection
    ? {
        exitCode: 0,
        stdoutText: await runShellCommandOnConnection(
          connection,
          ['cmd', 'role', 'get-role-holders', SMS_ROLE],
          20_000,
        ),
      }
    : await runCommand('adb', ['shell', 'cmd', 'role', 'get-role-holders', SMS_ROLE], 20_000);
  if (result.exitCode !== 0) {
    return [] as string[];
  }
  return result.stdoutText
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);
}

async function ensureSmsRoleAssigned(
  connection?: ConnectedDeviceConnection,
): Promise<SmsRoleState> {
  const previousHolders = await getSmsRoleHolders(connection);
  if (previousHolders.includes(PACKAGE_NAME)) {
    return { previousHolders, changed: false };
  }

  const addResult = connection
    ? {
        exitCode: 0,
        stdoutText: await runShellCommandOnConnection(
          connection,
          ['cmd', 'role', 'add-role-holder', SMS_ROLE, PACKAGE_NAME, '0'],
          30_000,
        ),
      }
    : await runCommand(
        'adb',
        ['shell', 'cmd', 'role', 'add-role-holder', SMS_ROLE, PACKAGE_NAME, '0'],
        30_000,
      );
  if (addResult.exitCode === 0) {
    const current = await getSmsRoleHolders(connection);
    if (current.includes(PACKAGE_NAME)) {
      return { previousHolders, changed: true };
    }
  }

  await promptDefaultSmsChangeOnDevice(PACKAGE_NAME, connection);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const current = await getSmsRoleHolders(connection);
    if (current.includes(PACKAGE_NAME)) {
      return { previousHolders, changed: true };
    }
    await Bun.sleep(1_000);
  }

  throw new Error('Timed out waiting for the restore helper to become the default SMS app.');
}

async function restorePreviousSmsRole(state: SmsRoleState, connection?: ConnectedDeviceConnection) {
  if (!state.changed) {
    return;
  }

  const previous = state.previousHolders.find((item) => item && item !== PACKAGE_NAME) || '';
  if (previous) {
    const addResult = connection
      ? {
          exitCode: 0,
          stdoutText: await runShellCommandOnConnection(
            connection,
            ['cmd', 'role', 'add-role-holder', SMS_ROLE, previous, '0'],
            30_000,
          ),
        }
      : await runCommand(
          'adb',
          ['shell', 'cmd', 'role', 'add-role-holder', SMS_ROLE, previous, '0'],
          30_000,
        );
    if (addResult.exitCode === 0) {
      const current = await getSmsRoleHolders(connection);
      if (current.includes(previous)) {
        return;
      }
    }

    await promptDefaultSmsChangeOnDevice(previous, connection);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const current = await getSmsRoleHolders(connection);
      if (current.includes(previous)) {
        return;
      }
      await Bun.sleep(1_000);
    }
    throw new Error(`Timed out waiting to restore the previous default SMS app (${previous}).`);
  }

  if (connection) {
    await runShellCommandOnConnection(
      connection,
      ['cmd', 'role', 'remove-role-holder', SMS_ROLE, PACKAGE_NAME, '0'],
      30_000,
    ).catch(() => {});
  } else {
    await runCommand(
      'adb',
      ['shell', 'cmd', 'role', 'remove-role-holder', SMS_ROLE, PACKAGE_NAME, '0'],
      30_000,
    ).catch(() => {});
  }
}

export async function restoreContactsOnDevice(
  contacts: RestoreContactRecord[],
  connection?: ConnectedDeviceConnection,
) {
  if (contacts.length === 0) {
    return {
      attempted: 0,
      restored: 0,
      failed: 0,
      detailLines: [],
    } satisfies HelperSummary;
  }
  return invokeHelper('contacts', contacts, 180_000, connection);
}

export async function restoreMessagesOnDevice(
  messages: RestoreMessageRecord[],
  connection?: ConnectedDeviceConnection,
) {
  if (messages.length === 0) {
    return {
      attempted: 0,
      restored: 0,
      failed: 0,
      detailLines: [],
    } satisfies HelperSummary;
  }

  const smsRoleState = await ensureSmsRoleAssigned(connection);
  try {
    return await invokeHelper('messages', messages, 240_000, connection);
  } finally {
    await restorePreviousSmsRole(smsRoleState, connection).catch(() => {});
  }
}

export async function deleteContactsOnDeviceForTesting(contacts: RestoreContactRecord[]) {
  return invokeHelper('delete-contacts', contacts, 120_000);
}

export async function deleteMessagesOnDeviceForTesting(messages: RestoreMessageRecord[]) {
  const smsRoleState = await ensureSmsRoleAssigned();
  try {
    return await invokeHelper('delete-messages', messages, 120_000);
  } finally {
    await restorePreviousSmsRole(smsRoleState).catch(() => {});
  }
}
