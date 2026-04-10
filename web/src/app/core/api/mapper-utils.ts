/**
 * Shared mapper utility types, constants, and reader functions
 * used across all response mapper modules.
 */
import type {
  DownloadProgressMessage,
  FirmwareTaskStatus,
  RescueFlashTransport,
  RescueQdlStorage,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverInstallResponse,
  WindowsSpdDriverInstallResponse,
} from '../models/desktop-api';

export type MapperValue = object | string | number | boolean | null | undefined;
export type MapperRecord = Record<string, MapperValue>;

export type SimpleOkResponse = {
  ok: boolean;
  error?: string;
};

export const firmwareTaskStatusValues = new Set<FirmwareTaskStatus>([
  'starting',
  'downloading',
  'paused',
  'preparing',
  'flashing',
  'completed',
  'failed',
  'canceled',
]);

export const rescueTransportValues = new Set<RescueFlashTransport>([
  'fastboot',
  'qdl',
  'unisoc',
  'mediatek',
]);

export const rescueStorageValues = new Set<RescueQdlStorage>(['auto', 'emmc', 'ufs']);

export const phaseValues = new Set<NonNullable<DownloadProgressMessage['phase']>>([
  'download',
  'prepare',
  'flash',
]);

export const windowsQdloaderDriverInstallMethods = new Set<
  WindowsQdloaderDriverInstallResponse['method']
>(['qdloader-setup']);

export const windowsSpdDriverInstallMethods = new Set<WindowsSpdDriverInstallResponse['method']>([
  'spd-setup',
]);

export const windowsMtkDriverInstallMethods = new Set<WindowsMtkDriverInstallResponse['method']>([
  'mtk-setup',
]);

export function asRecord(value: MapperValue): MapperRecord | null {
  return typeof value === 'object' && value !== null ? (value as MapperRecord) : null;
}

export function readString(record: MapperRecord, key: string, fallback = '') {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

export function readOptionalString(record: MapperRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readBoolean(record: MapperRecord, key: string, fallback = false) {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function readOptionalBoolean(record: MapperRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function readNumber(record: MapperRecord, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readOptionalNumber(record: MapperRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readStringArray(record: MapperRecord, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function readStringMap(value: MapperValue): Record<string, string> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, mapValue] of Object.entries(record)) {
    if (typeof mapValue === 'string') {
      result[key] = mapValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function readFirmwareTaskStatus(value: MapperValue): FirmwareTaskStatus | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return firmwareTaskStatusValues.has(value as FirmwareTaskStatus)
    ? (value as FirmwareTaskStatus)
    : undefined;
}

export function readRescueTransport(value: MapperValue): RescueFlashTransport | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return rescueTransportValues.has(value as RescueFlashTransport)
    ? (value as RescueFlashTransport)
    : undefined;
}

export function readRescueStorage(value: MapperValue): RescueQdlStorage | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return rescueStorageValues.has(value as RescueQdlStorage)
    ? (value as RescueQdlStorage)
    : undefined;
}

export function mapSimpleOkResponse(payload: MapperValue): SimpleOkResponse {
  const record = asRecord(payload);
  if (!record) {
    return { ok: false, error: 'Invalid response payload.' };
  }

  return {
    ok: readBoolean(record, 'ok', false),
    error: readOptionalString(record, 'error'),
  };
}
