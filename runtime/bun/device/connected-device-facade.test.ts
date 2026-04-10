import { afterEach, describe, expect, it } from 'bun:test';
import {
  resetConnectedDeviceConnection,
  setConnectedDeviceTransportFactoryForTests,
  withConnectedDeviceConnection,
} from './connected-device-facade.ts';
import type {
  ConnectedDeviceConnection,
  ConnectedDeviceTransport,
} from './device-transport-types.ts';

function createMockTransport() {
  let connectCount = 0;
  let closeCount = 0;

  const connection: ConnectedDeviceConnection = {
    kind: 'tango-daemon-usb',
    serial: 'SERIAL-1',
    adb: {} as never,
    close: async () => {
      closeCount += 1;
    },
  };

  const transport: ConnectedDeviceTransport = {
    kind: 'tango-daemon-usb',
    connect: async () => {
      connectCount += 1;
      return connection;
    },
  };

  return {
    connection,
    getConnectCount: () => connectCount,
    getCloseCount: () => closeCount,
    transportFactory: () => transport,
  };
}

afterEach(async () => {
  await resetConnectedDeviceConnection();
  setConnectedDeviceTransportFactoryForTests(null);
});

describe('connected-device-facade', () => {
  it('reuses the same transport connection across sequential operations until reset', async () => {
    const mock = createMockTransport();
    setConnectedDeviceTransportFactoryForTests(mock.transportFactory);

    const firstConnection = await withConnectedDeviceConnection(async (connection) => connection, {
      label: 'test:first',
    });
    const secondConnection = await withConnectedDeviceConnection(async (connection) => connection, {
      label: 'test:second',
    });

    expect(firstConnection).toBe(secondConnection);
    expect(mock.getConnectCount()).toBe(1);
    expect(mock.getCloseCount()).toBe(0);

    await resetConnectedDeviceConnection();

    expect(mock.getCloseCount()).toBe(1);
  });

  it('reuses the active connection for nested operations', async () => {
    const mock = createMockTransport();
    setConnectedDeviceTransportFactoryForTests(mock.transportFactory);

    await withConnectedDeviceConnection(async (outerConnection) => {
      await withConnectedDeviceConnection(async (innerConnection) => {
        expect(innerConnection).toBe(outerConnection);
      });
    });

    expect(mock.getConnectCount()).toBe(1);

    await resetConnectedDeviceConnection();

    expect(mock.getCloseCount()).toBe(1);
  });
});
