import { mkdir, open } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import {
  resetConnectedDeviceConnection,
  withConnectedDeviceConnection,
} from '../../../device/connected-device-facade.ts';
import { resolveCliAdbExecutable } from './connected-backups-adb-cli.ts';
import { ADB_COMMAND_TIMEOUT_MS, type CommandResult } from './connected-backups-shared.ts';

let sharedAdbCommandSessionDepth = 0;

function shouldReuseSharedAdbConnection() {
  return sharedAdbCommandSessionDepth > 0;
}

export async function withSharedAdbCommandSession<T>(action: () => Promise<T>): Promise<T> {
  sharedAdbCommandSessionDepth += 1;
  try {
    return await action();
  } finally {
    sharedAdbCommandSessionDepth = Math.max(0, sharedAdbCommandSessionDepth - 1);
    if (sharedAdbCommandSessionDepth === 0) {
      await resetConnectedDeviceConnection().catch(() => {});
    }
  }
}

async function runProcessCommand(
  command: string,
  args: string[],
  timeoutMs = ADB_COMMAND_TIMEOUT_MS,
) {
  let timedOut = false;
  let childProcess: Bun.Subprocess;
  try {
    childProcess = Bun.spawn([command, ...args], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        ['LD_PRELOAD']: '',
      },
    });
  } catch (error) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut,
      error: error instanceof Error ? error.message : String(error),
    } satisfies CommandResult;
  }

  const timeout =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          try {
            childProcess.kill();
          } catch {
            // Ignore kill races.
          }
        }, timeoutMs)
      : null;

  try {
    const stdoutStream = typeof childProcess.stdout === 'number' ? null : childProcess.stdout;
    const stderrStream = typeof childProcess.stderr === 'number' ? null : childProcess.stderr;
    const [stdoutText, stderrText, exitCode] = await Promise.all([
      stdoutStream ? new Response(stdoutStream).text() : Promise.resolve(''),
      stderrStream ? new Response(stderrStream).text() : Promise.resolve(''),
      childProcess.exited,
    ]);

    return {
      exitCode,
      stdoutText,
      stderrText,
      timedOut,
    } satisfies CommandResult;
  } catch (error) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut,
      error: error instanceof Error ? error.message : String(error),
    } satisfies CommandResult;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | Promise<void>,
) {
  if (timeoutMs <= 0) {
    return {
      timedOut: false,
      value: await promise,
    };
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const value = await Promise.race([
      promise.then((resolvedValue) => ({
        timedOut: false,
        value: resolvedValue,
      })),
      new Promise<{ timedOut: true; value?: never }>((resolve) => {
        timeoutId = setTimeout(() => {
          void onTimeout?.();
          resolve({ timedOut: true });
        }, timeoutMs);
      }),
    ]);
    return value;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function pullRemoteFileViaTango(
  remotePath: string,
  outputPath: string,
  timeoutMs: number,
): Promise<CommandResult> {
  const result = await withTimeout(
    withConnectedDeviceConnection(
      async (connection) => {
        const sync = await connection.adb.sync();
        await mkdir(dirname(outputPath), { recursive: true });
        const fileHandle = await open(outputPath, 'w');
        try {
          const stream = sync.read(remotePath);
          const reader = stream.getReader();
          let offset = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            await fileHandle.write(value, 0, value.byteLength, offset);
            offset += value.byteLength;
          }
        } finally {
          await fileHandle.close().catch(() => {});
          await sync.dispose().catch(() => {});
        }
      },
      {
        label: `backup:pull:${basename(remotePath)}`,
        reuseShared: shouldReuseSharedAdbConnection() ? undefined : false,
      },
    ),
    timeoutMs,
    () => resetConnectedDeviceConnection(),
  );

  if (result.timedOut) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut: true,
      error: 'ADB pull timed out.',
    } satisfies CommandResult;
  }

  return {
    exitCode: 0,
    stdoutText: '',
    stderrText: '',
    timedOut: false,
  } satisfies CommandResult;
}

async function pushLocalFileViaTango(
  localPath: string,
  remotePath: string,
  timeoutMs: number,
): Promise<CommandResult> {
  const result = await withTimeout(
    withConnectedDeviceConnection(
      async (connection) => {
        const sync = await connection.adb.sync();
        try {
          await connection.adb.subprocess.noneProtocol.spawnWaitText([
            'mkdir',
            '-p',
            dirname(remotePath),
          ]);
          await sync.write({
            filename: remotePath,
            file: Bun.file(localPath).stream() as never,
          });
        } finally {
          await sync.dispose().catch(() => {});
        }
      },
      {
        label: `backup:push:${basename(remotePath)}`,
        reuseShared: shouldReuseSharedAdbConnection() ? undefined : false,
      },
    ),
    timeoutMs,
    () => resetConnectedDeviceConnection(),
  );

  if (result.timedOut) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut: true,
      error: 'ADB push timed out.',
    } satisfies CommandResult;
  }

  return {
    exitCode: 0,
    stdoutText: '',
    stderrText: '',
    timedOut: false,
  } satisfies CommandResult;
}

async function runShellCommandViaTango(
  shellArgs: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  try {
    const result = await withTimeout(
      withConnectedDeviceConnection(
        async (connection) => {
          return connection.adb.subprocess.noneProtocol.spawnWaitText(shellArgs);
        },
        {
          label: `backup:shell:${shellArgs.join(' ')}`,
          reuseShared: shouldReuseSharedAdbConnection() ? undefined : false,
        },
      ),
      timeoutMs,
      () => resetConnectedDeviceConnection(),
    );

    if (result.timedOut) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: true,
        error: 'ADB shell command timed out.',
      } satisfies CommandResult;
    }

    return {
      exitCode: 0,
      stdoutText: result.value ?? '',
      stderrText: '',
      timedOut: false,
    } satisfies CommandResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: message,
      timedOut: /timed out/i.test(message),
      error: message,
    } satisfies CommandResult;
  }
}

async function installLocalApksViaTango(
  subcommand: 'install' | 'install-multiple',
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  const installOptions = args.filter((value) => value.startsWith('-'));
  const localApkPaths = args.filter((value) => !value.startsWith('-'));
  if (localApkPaths.length === 0) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut: false,
      error: `ADB ${subcommand} requires at least one local APK path.`,
    } satisfies CommandResult;
  }

  const remoteTempDir = '/data/local/tmp/lmfd-restore';
  const result = await withTimeout(
    withConnectedDeviceConnection(
      async (connection) => {
        await connection.adb.subprocess.noneProtocol.spawnWaitText(['mkdir', '-p', remoteTempDir]);

        const sync = await connection.adb.sync();
        const remoteApkPaths: string[] = [];
        try {
          for (const [index, localApkPath] of localApkPaths.entries()) {
            const remoteApkPath = `${remoteTempDir}/${Date.now()}-${index + 1}-${basename(localApkPath)}`;
            remoteApkPaths.push(remoteApkPath);
            await sync.write({
              filename: remoteApkPath,
              file: Bun.file(localApkPath).stream() as never,
            });
          }

          return await connection.adb.subprocess.noneProtocol.spawnWaitText([
            'pm',
            subcommand,
            ...installOptions,
            ...remoteApkPaths,
          ]);
        } finally {
          await sync.dispose().catch(() => {});
          if (remoteApkPaths.length > 0) {
            await connection.adb.subprocess.noneProtocol
              .spawnWaitText(['rm', '-f', ...remoteApkPaths])
              .catch(() => {});
          }
        }
      },
      {
        label: `backup:install:${basename(localApkPaths[0] || 'package.apk')}`,
        reuseShared: shouldReuseSharedAdbConnection() ? undefined : false,
      },
    ),
    timeoutMs,
    () => resetConnectedDeviceConnection(),
  );

  if (result.timedOut) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut: true,
      error: `ADB ${subcommand} timed out.`,
    } satisfies CommandResult;
  }

  const output = String(result.value ?? '');
  const succeeded = /^\s*Success\b/im.test(output);
  return {
    exitCode: succeeded ? 0 : -1,
    stdoutText: output,
    stderrText: succeeded ? '' : output,
    timedOut: false,
  } satisfies CommandResult;
}

async function runAdbCommandViaTango(args: string[], timeoutMs: number): Promise<CommandResult> {
  const [subcommand, ...rest] = args;

  if (!subcommand) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      timedOut: false,
      error: 'Missing adb subcommand.',
    } satisfies CommandResult;
  }

  if (subcommand === 'start-server') {
    return {
      exitCode: 0,
      stdoutText: '',
      stderrText: '',
      timedOut: false,
    } satisfies CommandResult;
  }

  if (subcommand === 'get-state') {
    try {
      const result = await withTimeout(
        withConnectedDeviceConnection(async () => 'device\\n', {
          timeoutMs,
          label: 'backup:get-state',
          reuseShared: shouldReuseSharedAdbConnection() ? undefined : false,
        }),
        timeoutMs,
        () => resetConnectedDeviceConnection(),
      );
      if (result.timedOut) {
        return {
          exitCode: -1,
          stdoutText: '',
          stderrText: '',
          timedOut: true,
          error: 'ADB get-state timed out.',
        } satisfies CommandResult;
      }

      return {
        exitCode: 0,
        stdoutText: String(result.value ?? ''),
        stderrText: '',
        timedOut: false,
      } satisfies CommandResult;
    } catch (error) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CommandResult;
    }
  }

  if (subcommand === 'shell') {
    return runShellCommandViaTango(rest, timeoutMs);
  }

  if (subcommand === 'pull') {
    const remotePath = rest[0];
    const outputPath = rest[1];
    if (!remotePath || !outputPath) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: false,
        error: 'ADB pull requires a remote path and an output path.',
      } satisfies CommandResult;
    }

    try {
      return await pullRemoteFileViaTango(remotePath, outputPath, timeoutMs);
    } catch (error) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CommandResult;
    }
  }

  if (subcommand === 'push') {
    const localPath = rest[0];
    const remotePath = rest[1];
    if (!localPath || !remotePath) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: false,
        error: 'ADB push requires a local path and a remote path.',
      } satisfies CommandResult;
    }

    try {
      return await pushLocalFileViaTango(localPath, remotePath, timeoutMs);
    } catch (error) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CommandResult;
    }
  }

  if (subcommand === 'install' || subcommand === 'install-multiple') {
    try {
      return await installLocalApksViaTango(subcommand, rest, timeoutMs);
    } catch (error) {
      return {
        exitCode: -1,
        stdoutText: '',
        stderrText: '',
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CommandResult;
    }
  }

  return {
    exitCode: -1,
    stdoutText: '',
    stderrText: '',
    timedOut: false,
    error: `Unsupported adb subcommand for Tango adapter: ${subcommand}`,
  } satisfies CommandResult;
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs = ADB_COMMAND_TIMEOUT_MS,
) {
  if (command === 'adb') {
    if (process.env.LMFD_FORCE_CLI_ADB === '1') {
      const cliAdb = await resolveCliAdbExecutable();
      if (!cliAdb) {
        return {
          exitCode: -1,
          stdoutText: '',
          stderrText: '',
          timedOut: false,
          error:
            'LMFD_FORCE_CLI_ADB=1 is set, but no adb executable was found in PATH or known SDK roots.',
        } satisfies CommandResult;
      }
      return runProcessCommand(cliAdb, args, timeoutMs);
    }
    return runAdbCommandViaTango(args, timeoutMs);
  }

  return runProcessCommand(command, args, timeoutMs);
}
