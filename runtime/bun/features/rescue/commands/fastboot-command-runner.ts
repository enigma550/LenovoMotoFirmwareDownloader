import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { FastbootClient } from 'fastboot-bun-ts/fastboot';
import { waitForFastbootDevice, waitForFastbootDeviceRemoval } from 'fastboot-bun-ts/usb';
import {
  resolveFastbootReconnectTimeoutMs,
  resolveFastbootSerial,
} from './rescue-command-policy.ts';
import type { RescueCommandExecutionContext } from './rescue-command-runner-context.ts';
import type { PreparedFastbootCommand } from './rescue-command-types.ts';

type FastbootReconnectMatcher = {
  serial?: string;
  idVendor?: number;
  idProduct?: number;
};

function createAbortError() {
  const abortError = new Error('Operation aborted.');
  abortError.name = 'AbortError';
  return abortError;
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createAbortError();
  }
}

async function closeFastbootClient(context: RescueCommandExecutionContext) {
  const client = context.state.fastbootClient;
  context.state.fastbootClient = undefined;
  if (!client) {
    return;
  }

  try {
    await client.close();
  } catch {
    // Ignore transport close races after device reboots/disconnects.
  }
}

function buildReconnectMatcher(client: FastbootClient): FastbootReconnectMatcher {
  const identity = client.transport.identity;
  return {
    serial: identity.serialNumber ?? identity.path,
    idVendor: identity.idVendor,
    idProduct: identity.idProduct,
  };
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function resolveBundledBunCommand() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;
  const bunExecutableName = process.platform === 'win32' ? 'bun.exe' : 'bun';

  const directCandidates = uniquePaths([
    execPath,
    argv0,
    join(dirname(execPath), bunExecutableName),
    join(dirname(argv0), bunExecutableName),
  ]);

  for (const candidate of directCandidates) {
    if (basename(candidate).toLowerCase().startsWith('bun') && existsSync(candidate)) {
      return candidate;
    }
  }

  const resolvedFromPath = Bun.which('bun');
  if (resolvedFromPath) {
    return resolvedFromPath;
  }

  return '';
}

async function ensureFastbootClient(context: RescueCommandExecutionContext) {
  assertNotAborted(context.signal);

  if (context.state.fastbootClient) {
    return context.state.fastbootClient;
  }

  const probeCommand = resolveBundledBunCommand();
  const client = await FastbootClient.connect({
    serial: resolveFastbootSerial(),
    confirmPrivilegedFix: async () => true,
    ...(probeCommand
      ? {
          probeProcess: {
            command: probeCommand,
            args: ['run'],
          },
        }
      : {}),
    onInfo: (message) => {
      context.onConsoleLine?.({ message, tone: 'warning' });
    },
  });
  context.state.fastbootClient = client;
  context.state.fastbootReconnectMatcher = buildReconnectMatcher(client);
  return client;
}

async function withAbortableFastbootCall<T>(
  context: RescueCommandExecutionContext,
  operation: (client: FastbootClient) => Promise<T>,
) {
  const client = await ensureFastbootClient(context);
  const abortListener = () => {
    void closeFastbootClient(context);
  };
  context.signal.addEventListener('abort', abortListener, { once: true });

  try {
    const result = await operation(client);
    assertNotAborted(context.signal);
    return result;
  } finally {
    context.signal.removeEventListener('abort', abortListener);
  }
}

async function reconnectFastbootAfterReboot(
  matcher: FastbootReconnectMatcher | undefined,
  signal: AbortSignal,
) {
  if (!matcher) {
    return;
  }

  assertNotAborted(signal);
  await waitForFastbootDeviceRemoval(matcher, 15_000).catch(() => false);
  assertNotAborted(signal);

  const reconnected = await waitForFastbootDevice(matcher, resolveFastbootReconnectTimeoutMs());
  if (reconnected === null) {
    throw new Error('Fastboot device did not return after rebooting back into bootloader mode.');
  }
}

export async function runFastbootCommand(
  command: PreparedFastbootCommand,
  context: RescueCommandExecutionContext,
) {
  const verb = (command.args[0] || '').toLowerCase();

  if (!verb) {
    throw new Error('Prepared fastboot command is missing an operation.');
  }

  switch (verb) {
    case 'flash': {
      const partition = command.args[1];
      const filePath = command.args[2];
      if (!partition || !filePath) {
        throw new Error(`Malformed fastboot flash command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) =>
        client.flashFile(partition, resolve(context.workDir, filePath)),
      );
      return;
    }

    case 'boot': {
      const filePath = command.args[1];
      if (!filePath) {
        throw new Error(`Malformed fastboot boot command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) =>
        client.bootFile(resolve(context.workDir, filePath)),
      );
      await closeFastbootClient(context);
      return;
    }

    case 'erase': {
      const partition = command.args[1];
      if (!partition) {
        throw new Error(`Malformed fastboot erase command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) => client.erase(partition));
      return;
    }

    case 'format': {
      const partition = command.args[1];
      if (!partition) {
        throw new Error(`Malformed fastboot format command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) =>
        client.protocol.command(`format:${partition}`),
      );
      return;
    }

    case 'getvar': {
      const variable = command.args[1];
      if (!variable) {
        throw new Error(`Malformed fastboot getvar command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) => client.getVar(variable));
      return;
    }

    case 'oem': {
      const oemCommand = command.args.slice(1).join(' ').trim();
      if (!oemCommand) {
        throw new Error(`Malformed fastboot oem command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) => client.oem(oemCommand));
      return;
    }

    case 'set-active': {
      const slot = command.args[1];
      if (!slot) {
        throw new Error(`Malformed fastboot set-active command: ${command.label}`);
      }
      await withAbortableFastbootCall(context, (client) => client.setActive(slot));
      return;
    }

    case 'continue': {
      await withAbortableFastbootCall(context, (client) => client.protocol.command('continue'));
      await closeFastbootClient(context);
      return;
    }

    case 'reboot': {
      const target = command.args[1];
      const matcher = context.state.fastbootReconnectMatcher;
      await withAbortableFastbootCall(context, (client) => client.reboot(target));
      await closeFastbootClient(context);

      if (target === 'bootloader' || target === 'fastboot') {
        await reconnectFastbootAfterReboot(matcher, context.signal);
      }
      return;
    }

    default:
      throw new Error(`Unsupported prepared fastboot command: ${command.label}`);
  }
}

export async function disposeFastbootRunnerContext(context: RescueCommandExecutionContext) {
  await closeFastbootClient(context);
}
