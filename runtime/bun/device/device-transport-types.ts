import type { Adb } from '@yume-chan/adb';
import type { DeviceInfo } from '../../../core/domain/device/info.ts';

export interface ConnectedDeviceConnection {
  kind: 'tango-daemon-usb';
  serial: string;
  adb: Adb;
  close(): Promise<void>;
}

export interface ConnectedDeviceTransport {
  readonly kind: 'tango-daemon-usb';
  connect(): Promise<ConnectedDeviceConnection>;
  waitForAvailable?(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void>;
}

export interface RuntimeConnectedDeviceInfo {
  transportKind: 'tango-daemon-usb';
  adbAvailable: boolean;
  device: DeviceInfo;
}
