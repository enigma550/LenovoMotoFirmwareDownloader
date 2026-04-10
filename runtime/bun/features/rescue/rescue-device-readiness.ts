/**
 * Device readiness checks for rescue flashing.
 * Verifies that the target device is in the correct mode (EDL or Unisoc)
 * before executing flash commands.
 */
import { listFastbootDevices } from 'fastboot-bun-ts/usb';
import type { DownloadProgressMessage } from '../../../shared/desktop-rpc';
import { qdlCommandDisplayName, resolveQdlCommand } from './commands/qdl-command.ts';
import {
  resolveFastbootReconnectTimeoutMs,
  resolveFastbootSerial,
  resolveUnisocPacToolCandidates,
} from './commands/rescue-command-policy.ts';
import type { PreparedRescueCommand } from './commands/rescue-command-types.ts';
import { ensureWindowsQdloaderDriver } from './commands/windows-qdloader-driver-installer.ts';
import { isCommandAvailable, probeQualcommEdlUsb } from './device-flasher.ts';
import { rebootConnectedDeviceToBootloader } from './reboot-to-bootloader.ts';
import { rebootConnectedDeviceToEdl } from './reboot-to-edl.ts';
import { wait } from './rescue-active-tracker.ts';

type ReadinessEmitter = (
  progress: Partial<DownloadProgressMessage> & {
    status: DownloadProgressMessage['status'];
  },
) => void;

export async function ensureFastbootDeviceReady(options: {
  signal: AbortSignal;
  savePath: string;
  emit: ReadinessEmitter;
}) {
  const { signal, savePath, emit } = options;

  emit({
    status: 'preparing',
    savePath,
    phase: 'prepare',
    stepLabel: 'Checking Fastboot device availability...',
  });

  let devices = await listFastbootDevices();
  if (devices.length === 0) {
    emit({
      status: 'preparing',
      savePath,
      phase: 'prepare',
      stepLabel: 'No Fastboot device found. Trying Tango ADB reboot bootloader...',
    });

    const rebootResult = await rebootConnectedDeviceToBootloader();
    if (rebootResult.ok) {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel:
          rebootResult.detail ||
          'Sent reboot bootloader via Tango ADB. Waiting for Fastboot device...',
      });

      const deadline = Date.now() + resolveFastbootReconnectTimeoutMs();
      while (Date.now() < deadline) {
        if (signal.aborted) {
          const abortError = new Error('Operation aborted.');
          abortError.name = 'AbortError';
          throw abortError;
        }

        await wait(1000);
        devices = await listFastbootDevices();
        if (devices.length > 0) {
          break;
        }
      }
    } else if (rebootResult.error) {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: `Tango ADB reboot bootloader failed: ${rebootResult.error}`,
      });
    }
  }

  if (devices.length === 0) {
    const configuredSerial = resolveFastbootSerial();
    throw new Error(
      configuredSerial
        ? `No Fastboot device matching '${configuredSerial}' was detected. If the phone is still booted into Android, connect it with ADB enabled and retry so Rescue Lite can reboot it into bootloader mode.`
        : 'No Fastboot device detected. If the phone is still booted into Android, connect it with ADB enabled and retry so Rescue Lite can reboot it into bootloader mode automatically.',
    );
  }

  const labels = devices
    .slice(0, 2)
    .map((device) => device.serialNumber || device.product || device.path)
    .filter(Boolean);
  const summary =
    labels.length > 0 ? labels.join(', ') : `${devices.length} Fastboot device(s) detected`;
  emit({
    status: 'preparing',
    savePath,
    phase: 'prepare',
    stepLabel: `Detected Fastboot device${devices.length > 1 ? 's' : ''}: ${summary}`,
  });
}

export async function ensureEdlDeviceReady(options: {
  workDir: string;
  signal: AbortSignal;
  savePath: string;
  setActiveProcess: (process: Bun.Subprocess | null) => void;
  emit: ReadinessEmitter;
}) {
  const { workDir, signal, savePath, setActiveProcess, emit } = options;

  const qdlCommand = await resolveQdlCommand();
  emit({
    status: 'preparing',
    savePath,
    phase: 'prepare',
    stepLabel:
      qdlCommand.source === 'bundled' || qdlCommand.source === 'custom'
        ? `Checking QDL executable availability (${qdlCommandDisplayName(qdlCommand.command)})...`
        : 'Checking QDL executable availability...',
  });
  const qdlAvailable = await isCommandAvailable({
    command: qdlCommand.command,
    args: ['--help'],
    cwd: workDir,
    signal,
    onProcess: setActiveProcess,
  });
  if (!qdlAvailable) {
    if (qdlCommand.source === 'bundled' || qdlCommand.source === 'custom') {
      throw new Error(
        `EDL/firehose rescue could not execute ${qdlCommandDisplayName(qdlCommand.command)}.`,
      );
    }
    throw new Error('EDL/firehose rescue requires `qdl` in PATH. Install qdl and retry.');
  }

  if (process.platform === 'win32') {
    emit({
      status: 'preparing',
      savePath,
      phase: 'prepare',
      stepLabel: 'Ensuring Windows Qualcomm 9008 USB driver...',
    });
    const driverEnsureResult = await ensureWindowsQdloaderDriver({
      cwd: workDir,
      signal,
      onProcess: setActiveProcess,
    });
    emit({
      status: 'preparing',
      savePath,
      phase: 'prepare',
      stepLabel: driverEnsureResult.detail,
    });
  }

  const usbProbe = await probeQualcommEdlUsb({
    cwd: workDir,
    signal,
    onProcess: setActiveProcess,
  });
  emit({
    status: 'preparing',
    savePath,
    phase: 'prepare',
    stepLabel: usbProbe.detail,
  });

  let edlReady = usbProbe.detected === true;
  if (!edlReady) {
    emit({
      status: 'preparing',
      savePath,
      phase: 'prepare',
      stepLabel: 'No EDL device found. Trying Tango ADB reboot edl...',
    });

    const rebootToEdlResult = await rebootConnectedDeviceToEdl();
    const rebootedToEdl = rebootToEdlResult.ok;

    if (rebootedToEdl) {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel:
          rebootToEdlResult.detail ||
          'Sent reboot edl via Tango ADB. Waiting for EDL USB device...',
      });

      if (process.platform === 'linux') {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (signal.aborted) {
            const abortError = new Error('Operation aborted.');
            abortError.name = 'AbortError';
            throw abortError;
          }

          await wait(1000);
          const followUpProbe = await probeQualcommEdlUsb({
            cwd: workDir,
            signal,
            onProcess: setActiveProcess,
          });
          if (followUpProbe.detected) {
            edlReady = true;
            emit({
              status: 'preparing',
              savePath,
              phase: 'prepare',
              stepLabel: followUpProbe.detail,
            });
            break;
          }
        }
      }
    }

    if (!rebootedToEdl && rebootToEdlResult.error) {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: `Tango ADB reboot edl failed: ${rebootToEdlResult.error}`,
      });
    }

    if (!edlReady && process.platform === 'linux') {
      throw new Error(
        'No Qualcomm EDL USB device detected (05c6:9008). Put the phone in EDL mode manually and retry.',
      );
    }
  }
}

export async function ensureUnisocToolReady(options: {
  workDir: string;
  signal: AbortSignal;
  savePath: string;
  setActiveProcess: (process: Bun.Subprocess | null) => void;
  emit: ReadinessEmitter;
}) {
  const { workDir, signal, savePath, setActiveProcess, emit } = options;

  emit({
    status: 'preparing',
    savePath,
    phase: 'prepare',
    stepLabel: 'Checking Unisoc PAC tool availability...',
  });

  const unisocToolCandidates = resolveUnisocPacToolCandidates();
  let resolvedTool = '';
  for (const candidate of unisocToolCandidates) {
    const available = await isCommandAvailable({
      command: candidate,
      args: [],
      cwd: workDir,
      signal,
      onProcess: setActiveProcess,
    });
    if (!available) {
      continue;
    }
    resolvedTool = candidate;
    break;
  }

  if (!resolvedTool) {
    throw new Error(
      `Unisoc PAC rescue requires spd-tool in PATH (${unisocToolCandidates.join(', ')}). Install github:enigma550/spd-tool-bun or set RESCUE_UNISOC_TOOL to override the executable path.`,
    );
  }

  emit({
    status: 'preparing',
    savePath,
    phase: 'prepare',
    stepLabel: `Using Unisoc PAC tool: ${resolvedTool}`,
  });
}

export async function ensureDeviceReadiness(options: {
  commands: PreparedRescueCommand[];
  workDir: string;
  signal: AbortSignal;
  savePath: string;
  setActiveProcess: (process: Bun.Subprocess | null) => void;
  emit: ReadinessEmitter;
}) {
  const hasFastbootCommands = options.commands.some((command) => command.tool === 'fastboot');
  if (hasFastbootCommands) {
    await ensureFastbootDeviceReady({
      signal: options.signal,
      savePath: options.savePath,
      emit: options.emit,
    });
    return;
  }

  const hasEdlCommands = options.commands.some((command) => command.tool === 'edl-firehose');
  if (hasEdlCommands) {
    await ensureEdlDeviceReady(options);
    return;
  }

  const hasUnisocCommands = options.commands.some((command) => command.tool === 'unisoc-pac');
  if (hasUnisocCommands) {
    await ensureUnisocToolReady(options);
  }
}
