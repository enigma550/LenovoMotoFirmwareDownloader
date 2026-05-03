import { runBufferedCommand } from '../../process/index.ts';
import type {
  ConnectedDeviceConnection,
  ConnectedDeviceTransport,
} from '../device-transport-types.ts';
import { FileBackedAdbCredentialStore } from '../file-backed-adb-credential-store.ts';
import {
  importTangoAdb,
  importTangoUsbDaemonBridge,
  importUsbModule,
} from '../tango-bun-compat.ts';

type TangoUsbObserver = {
  current: readonly unknown[];
  onListChange(listener: (devices: readonly unknown[]) => void): (() => void) | undefined;
  stop(): void;
};

type TangoUsbDevice = {
  serial: string;
  connect(): Promise<unknown>;
};

const CONNECT_WAIT_TIMEOUT_MS = 10_000;
const CONNECT_WAIT_POLL_INTERVAL_MS = 250;
const CONNECT_ATTEMPT_TIMEOUT_MS = 20_000;

async function createNodeUsbDeviceManager() {
  let usbModule: Record<string, unknown>;
  try {
    usbModule = await importUsbModule();
  } catch {
    throw new Error(
      'Tango Daemon USB transport could not load the native "usb" runtime dependency. ' +
        'If you are running from source, install it with: bun add usb. ' +
        'If you are running a packaged build, rebuild the app so the bundled runtime modules are included.',
    );
  }

  const UsbBridge = usbModule['WebUSB'] as
    | (new (options?: {
        allowAllDevices?: boolean;
      }) => object)
    | undefined;
  if (typeof UsbBridge !== 'function') {
    throw new Error('The "usb" package did not expose a WebUSB implementation.');
  }

  const usbBridge = new UsbBridge({ allowAllDevices: true });
  const { AdbDaemonWebUsbDeviceManager: AdbDaemonUsbDeviceManager } =
    await importTangoUsbDaemonBridge();
  return new AdbDaemonUsbDeviceManager(usbBridge as never);
}

function isUsbBusyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('LIBUSB_ERROR_BUSY');
}

function isTransientUsbConnectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('data.buffer') ||
    lower.includes("reading 'buffer'") ||
    lower.includes("reading 'bytelength'") ||
    lower.includes('networkerror')
  );
}

function isTimedOutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('timed out after');
}

function createTimeoutTimer(timeoutMs: number | undefined, onTimeout: () => void) {
  if (!timeoutMs || timeoutMs <= 0) {
    return null;
  }
  return setTimeout(onTimeout, timeoutMs);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          void onTimeout?.();
          reject(new Error(`Timed out after ${timeoutMs} ms.`));
        }, timeoutMs);
        timeoutId.unref?.();
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function waitForDeviceViaObserver(
  observer: TangoUsbObserver,
  options?: { timeoutMs?: number; signal?: AbortSignal },
) {
  if (observer.current.length > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(new Error('Wait for USB device aborted.'));
    };

    const stopListener = observer.onListChange((devices) => {
      if (devices.length > 0) {
        cleanup();
        resolve();
      }
    });

    const timer = createTimeoutTimer(options?.timeoutMs, () => {
      cleanup();
      reject(new Error('Timed out waiting for USB device.'));
    });

    const signal = options?.signal;
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new Error('Wait for USB device aborted.'));
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
      }
      stopListener?.();
      signal?.removeEventListener('abort', handleAbort);
    }
  });
}

async function waitForFirstDevice(
  manager: {
    getDevices(): Promise<readonly unknown[]>;
    trackDevices(): Promise<TangoUsbObserver>;
  },
  options?: { timeoutMs?: number; signal?: AbortSignal },
) {
  const existingDevices = await manager.getDevices();
  if (existingDevices.length > 0) {
    return existingDevices[0];
  }

  const observer = await manager.trackDevices();
  try {
    if (observer.current.length > 0) {
      return observer.current[0];
    }

    const deadline = Date.now() + (options?.timeoutMs ?? CONNECT_WAIT_TIMEOUT_MS);
    while (Date.now() < deadline) {
      await waitForDeviceViaObserver(observer, {
        timeoutMs: Math.min(CONNECT_WAIT_POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())),
        signal: options?.signal,
      }).catch(() => {});

      if (observer.current.length > 0) {
        return observer.current[0];
      }

      const polledDevices = await manager.getDevices();
      if (polledDevices.length > 0) {
        return polledDevices[0];
      }
    }

    return null;
  } finally {
    observer.stop();
  }
}

async function runLocalCommand(command: string[]) {
  const [executable, ...args] = command;
  if (!executable) {
    return null;
  }

  const result = await runBufferedCommand({
    args,
    command: executable,
    envMode: 'sidecar',
  });

  if (result.exitCode !== 0 && !result.stdoutText.trim()) {
    return null;
  }

  return (result.stdoutText || result.stderrText).trim() || null;
}

async function findUsbLockOwner(device: unknown) {
  const rawDevice = (
    device as { raw?: { device?: { busNumber?: number; deviceAddress?: number } } }
  )?.raw?.device;
  const busNumber = rawDevice?.busNumber;
  const deviceAddress = rawDevice?.deviceAddress;
  if (!Number.isInteger(busNumber) || !Number.isInteger(deviceAddress)) {
    return null;
  }

  const devicePath = `/dev/bus/usb/${String(busNumber).padStart(3, '0')}/${String(deviceAddress).padStart(3, '0')}`;
  const fuserOutput = await runLocalCommand(['fuser', devicePath]);
  if (!fuserOutput) {
    return null;
  }

  const pid = fuserOutput.split(/\s+/).find((token) => /^\d+$/.test(token));
  if (!pid || Number.parseInt(pid, 10) === process.pid) {
    return null;
  }

  const command = (await runLocalCommand(['ps', '-p', pid, '-o', 'comm=']))?.trim() || 'unknown';
  return { pid, command, devicePath };
}

export class TangoDaemonUsbTransport implements ConnectedDeviceTransport {
  readonly kind = 'tango-daemon-usb' as const;

  private async closeFailedConnection(connection: {
    device?: { raw?: { close?: () => Promise<void> | void } };
    readable?: { cancel?: () => Promise<void> | void };
    writable?: { abort?: (reason?: unknown) => Promise<void> | void };
  }) {
    try {
      await connection.writable?.abort?.(new Error('Closing failed Tango USB connection.'));
    } catch {
      // Ignore cleanup errors.
    }

    try {
      await connection.readable?.cancel?.();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      await connection.device?.raw?.close?.();
    } catch {
      // Ignore cleanup errors.
    }
  }

  async waitForAvailable(options?: { timeoutMs?: number; signal?: AbortSignal }) {
    const manager = await createNodeUsbDeviceManager();
    const devices = await manager.getDevices();
    if (devices.length > 0) {
      return;
    }

    const observer = await manager.trackDevices();
    try {
      if (observer.current.length > 0) {
        return;
      }
      await waitForDeviceViaObserver(observer, options);
    } finally {
      observer.stop();
    }
  }

  async connect(): Promise<ConnectedDeviceConnection> {
    const attempts = 6;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const manager = await createNodeUsbDeviceManager();
      const selectedDevice = (await waitForFirstDevice(manager, {
        timeoutMs: CONNECT_WAIT_TIMEOUT_MS,
      })) as TangoUsbDevice | null;
      if (!selectedDevice) {
        throw new Error('No direct USB ADB device detected for Tango Daemon USB transport.');
      }

      let usbConnection: unknown = null;

      try {
        const credentialStore = new FileBackedAdbCredentialStore();
        const { Adb, AdbDaemonTransport } = await importTangoAdb();
        usbConnection = await withTimeout(
          selectedDevice.connect(),
          CONNECT_ATTEMPT_TIMEOUT_MS,
          async () => {
            if (usbConnection) {
              await this.closeFailedConnection(usbConnection as never);
            }
          },
        );
        const daemonTransport = await (async () => {
          try {
            return await withTimeout(
              AdbDaemonTransport.authenticate({
                serial: selectedDevice.serial,
                connection: usbConnection as never,
                credentialStore,
              }),
              CONNECT_ATTEMPT_TIMEOUT_MS,
              async () => {
                if (usbConnection) {
                  await this.closeFailedConnection(usbConnection as never);
                }
              },
            );
          } catch (error) {
            if (isTimedOutError(error)) {
              throw new Error(
                'ADB authentication did not complete in time. Unlock the phone and approve the USB debugging prompt, then try again.',
              );
            }
            throw error;
          }
        })();
        const adb = new Adb(daemonTransport);

        return {
          kind: this.kind,
          serial: selectedDevice.serial,
          adb,
          close: async () => {
            await adb.close().catch(() => {});
            await this.closeFailedConnection(usbConnection as never);
          },
        };
      } catch (error) {
        lastError = error;
        if (usbConnection) {
          await this.closeFailedConnection(usbConnection as never);
          usbConnection = null;
        }
        if (isUsbBusyError(error)) {
          const lockOwner = await findUsbLockOwner(selectedDevice);
          if (lockOwner) {
            lastError = new Error(
              `USB device ${lockOwner.devicePath} is busy (locked by ${lockOwner.command} PID ${lockOwner.pid}).`,
            );
          }
        }
        if ((!isUsbBusyError(error) && !isTransientUsbConnectError(error)) || attempt >= attempts) {
          throw lastError instanceof Error ? lastError : error;
        }
        await Bun.sleep(250);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? 'Failed to connect to direct USB ADB device.'));
  }
}
