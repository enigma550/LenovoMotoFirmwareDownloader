import type { Adb } from '@yume-chan/adb';
import type { DeviceInfo } from '../../../core/domain/device/info.ts';
import type {
  ConnectedDeviceConnection,
  ConnectedDeviceTransport,
  RuntimeConnectedDeviceInfo,
} from './device-transport-types.ts';
import { TangoDaemonUsbTransport } from './transports/tango-daemon-usb.transport.ts';

type ConnectedDeviceOperationOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  label?: string;
  reuseShared?: boolean;
};

type ReadConnectedDeviceInfoOptions = ConnectedDeviceOperationOptions & {
  includeImei?: boolean;
};

let connectionOperationSequence = 0;
const DEFAULT_CONNECTION_IDLE_CLOSE_MS = process.platform === 'win32' ? 60_000 : 5_000;

type OpenedConnectedDeviceConnection = {
  connection: ConnectedDeviceConnection;
  operationId: number;
  label: string;
};

type SharedConnectedDeviceConnectionState = {
  promise: Promise<OpenedConnectedDeviceConnection>;
  leaseCount: number;
  idleCloseTimer: ReturnType<typeof setTimeout> | null;
  closingPromise: Promise<void> | null;
};

let sharedConnectionState: SharedConnectedDeviceConnectionState | null = null;
let connectedDeviceTransportFactory: () => ConnectedDeviceTransport = () =>
  new TangoDaemonUsbTransport();

function nextConnectionOperationId() {
  connectionOperationSequence += 1;
  return connectionOperationSequence;
}

function logConnectedDeviceOperation(
  operationId: number,
  phase:
    | 'open'
    | 'opened'
    | 'close'
    | 'closed'
    | 'error'
    | 'wait'
    | 'wait-ok'
    | 'wait-error'
    | 'reuse',
  label: string,
  extra?: string,
) {
  const suffix = extra ? ` ${extra}` : '';
  console.error(`[DEVICE ${operationId}] ${phase} ${label}${suffix}`);
}

function parseGetPropOutput(output: string) {
  return new Map(
    output
      .split('\n')
      .map((line) => line.match(/\[([^\]]+)\]: \[([^\]]+)\]/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

function extractImeiFromServiceOutput(output: string) {
  const matches = output.match(/'([^']+)'/g);
  if (!matches) {
    return '';
  }

  return matches
    .join('')
    .replace(/[^0-9]/g, '')
    .substring(0, 15);
}

async function readImeiViaServiceCall(adb: Adb) {
  try {
    const output = await adb.subprocess.noneProtocol.spawnWaitText([
      'service',
      'call',
      'iphonesubinfo',
      '1',
      's16',
      'com.android.shell',
    ]);
    return extractImeiFromServiceOutput(output);
  } catch {
    return '';
  }
}

async function readDeviceInfoFromConnection(
  connection: ConnectedDeviceConnection,
  options?: ReadConnectedDeviceInfoOptions,
): Promise<DeviceInfo> {
  const propertiesOutput = await connection.adb.subprocess.noneProtocol.spawnWaitText(['getprop']);
  const imei = options?.includeImei === false ? '' : await readImeiViaServiceCall(connection.adb);
  const properties = parseGetPropOutput(propertiesOutput);

  return {
    imei,
    modelName: properties.get('ro.product.model') || 'Motorola Device',
    modelCode: properties.get('ro.boot.hardware.sku') || properties.get('ro.build.product') || '',
    sn: properties.get('ro.serialno') || '',
    roCarrier: properties.get('ro.carrier') || 'reteu',
  };
}

async function openConnectedDeviceConnection(options?: ConnectedDeviceOperationOptions) {
  const transport = connectedDeviceTransportFactory();
  const operationId = nextConnectionOperationId();
  const label = options?.label || 'unnamed';

  try {
    logConnectedDeviceOperation(operationId, 'open', label);
    const connection = await transport.connect();
    logConnectedDeviceOperation(
      operationId,
      'opened',
      label,
      connection.serial ? `serial=${connection.serial}` : undefined,
    );
    return { connection, operationId, label };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConnectedDeviceOperation(operationId, 'error', label, message);
    throw new Error(`Unable to connect to a direct USB ADB device. ${message}`);
  }
}

async function withIsolatedConnectedDeviceConnection<T>(
  action: (connection: ConnectedDeviceConnection) => Promise<T>,
  options?: ConnectedDeviceOperationOptions,
): Promise<T> {
  const opened = await openConnectedDeviceConnection(options);
  try {
    return await action(opened.connection);
  } finally {
    logConnectedDeviceOperation(opened.operationId, 'close', opened.label, 'isolated');
    await opened.connection.close().catch(() => {});
    logConnectedDeviceOperation(opened.operationId, 'closed', opened.label, 'isolated');
  }
}

function clearIdleCloseTimer(state: SharedConnectedDeviceConnectionState) {
  if (!state.idleCloseTimer) {
    return;
  }

  clearTimeout(state.idleCloseTimer);
  state.idleCloseTimer = null;
}

async function closeSharedConnectionState(
  state: SharedConnectedDeviceConnectionState,
  reason: string,
) {
  clearIdleCloseTimer(state);
  if (sharedConnectionState === state) {
    sharedConnectionState = null;
  }

  if (state.closingPromise) {
    return state.closingPromise;
  }

  state.closingPromise = (async () => {
    const opened = await state.promise.catch(() => null);
    if (!opened) {
      return;
    }

    logConnectedDeviceOperation(opened.operationId, 'close', opened.label, reason);
    await opened.connection.close().catch(() => {});
    logConnectedDeviceOperation(opened.operationId, 'closed', opened.label, reason);
  })();

  await state.closingPromise;
}

function scheduleIdleClose(state: SharedConnectedDeviceConnectionState) {
  clearIdleCloseTimer(state);
  state.idleCloseTimer = setTimeout(() => {
    void closeSharedConnectionState(state, 'idle-timeout').catch(() => {});
  }, DEFAULT_CONNECTION_IDLE_CLOSE_MS);
  state.idleCloseTimer.unref?.();
}

async function acquireConnectedDeviceConnection(options?: ConnectedDeviceOperationOptions) {
  const label = options?.label || 'unnamed';
  const currentState = sharedConnectionState;
  if (currentState) {
    const reusedOperationId = nextConnectionOperationId();
    currentState.leaseCount += 1;
    clearIdleCloseTimer(currentState);

    try {
      const opened = await currentState.promise;
      logConnectedDeviceOperation(
        reusedOperationId,
        'reuse',
        label,
        opened.connection.serial ? `serial=${opened.connection.serial}` : undefined,
      );
      return { state: currentState, opened };
    } catch (error) {
      currentState.leaseCount = Math.max(0, currentState.leaseCount - 1);
      throw error;
    }
  }

  const state: SharedConnectedDeviceConnectionState = {
    promise: Promise.resolve(null as never),
    leaseCount: 1,
    idleCloseTimer: null,
    closingPromise: null,
  };

  state.promise = openConnectedDeviceConnection(options)
    .then(async (opened) => {
      if (sharedConnectionState !== state) {
        await opened.connection.close().catch(() => {});
        throw new Error('Connected device connection was reset while opening.');
      }
      return opened;
    })
    .catch((error) => {
      if (sharedConnectionState === state) {
        sharedConnectionState = null;
      }
      throw error;
    });

  sharedConnectionState = state;
  const opened = await state.promise;
  return { state, opened };
}

async function releaseConnectedDeviceConnection(state: SharedConnectedDeviceConnectionState) {
  state.leaseCount = Math.max(0, state.leaseCount - 1);
  if (state.leaseCount > 0) {
    return;
  }

  if (sharedConnectionState === state) {
    scheduleIdleClose(state);
    return;
  }

  await closeSharedConnectionState(state, 'released');
}

export async function waitForConnectedDeviceAvailability(
  options?: ConnectedDeviceOperationOptions,
) {
  const transport = connectedDeviceTransportFactory();
  const operationId = nextConnectionOperationId();
  const label = options?.label || 'unnamed';
  if (typeof transport.waitForAvailable !== 'function') {
    throw new Error('Direct USB ADB transport does not support waiting for device availability.');
  }

  logConnectedDeviceOperation(operationId, 'wait', label);
  try {
    await transport.waitForAvailable({
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
    logConnectedDeviceOperation(operationId, 'wait-ok', label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConnectedDeviceOperation(operationId, 'wait-error', label, message);
    throw error;
  }
}

export async function withConnectedDeviceConnection<T>(
  action: (connection: ConnectedDeviceConnection) => Promise<T>,
  options?: ConnectedDeviceOperationOptions,
): Promise<T> {
  if (options?.reuseShared === false) {
    return withIsolatedConnectedDeviceConnection(action, options);
  }

  const { state, opened } = await acquireConnectedDeviceConnection(options);
  try {
    return await action(opened.connection);
  } finally {
    await releaseConnectedDeviceConnection(state);
  }
}

export async function resetConnectedDeviceConnection() {
  const state = sharedConnectionState;
  if (!state) {
    return;
  }

  sharedConnectionState = null;
  await closeSharedConnectionState(state, 'reset');
}

export async function readConnectedDeviceInfo(
  options?: ReadConnectedDeviceInfoOptions,
): Promise<RuntimeConnectedDeviceInfo> {
  return withConnectedDeviceConnection(
    async (connection) => ({
      transportKind: connection.kind,
      adbAvailable: true,
      device: await readDeviceInfoFromConnection(connection, options),
    }),
    options,
  );
}

export function setConnectedDeviceTransportFactoryForTests(
  factory: (() => ConnectedDeviceTransport) | null,
) {
  connectedDeviceTransportFactory = factory ?? (() => new TangoDaemonUsbTransport());
}
