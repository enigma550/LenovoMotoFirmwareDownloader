import type { DeviceInfo } from '../../core/domain/device/info.ts';
import type { FirmwareVariant } from '../../core/domain/firmware/variant.ts';
import {
  extractPublishDate,
  extractRecipeUrl,
  extractRomMatchIdentifier,
  extractRomUrl,
} from '../../core/features/firmware/extract-rom.ts';
import { requestApi } from '../../core/infra/lmsa/api.ts';
import type { ConnectedLookupResponse } from '../shared/desktop-rpc';
import {
  readConnectedDeviceInfo,
  resetConnectedDeviceConnection,
  waitForConnectedDeviceAvailability,
} from './device/connected-device-facade.ts';

type LmsaPayloadValue = object | string | number | boolean | null;

function generateEncryptCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function isValidLmsaSerialNumber(serialNumber: string) {
  return /^([a-zA-Z]{1}[a-hj-np-zA-HJ-NP-Z0-9]{7})$/.test(serialNumber);
}

function normalizeDeviceInfo(device: DeviceInfo): DeviceInfo {
  return {
    imei: device.imei || '',
    modelName: device.modelName || 'Motorola Device',
    modelCode: device.modelCode || '',
    sn: device.sn || '',
    roCarrier: device.roCarrier || 'reteu',
  };
}

export async function lookupConnectedDeviceFirmwareFromDeviceInfo(
  rawDevice: DeviceInfo,
  options: {
    adbAvailable?: boolean;
  } = {},
): Promise<ConnectedLookupResponse> {
  const adbAvailable = options.adbAvailable ?? true;
  const device = normalizeDeviceInfo(rawDevice);
  const attempts: ConnectedLookupResponse['attempts'] = [];
  const variants: FirmwareVariant[] = [];

  const lookupAttempts: Array<{
    mode: 'IMEI' | 'SN';
    endpoint: string;
    payload: Record<string, string>;
  }> = [];

  if (device.imei) {
    lookupAttempts.push({
      mode: 'IMEI',
      endpoint: '/rescueDevice/getNewResourceByImei.jhtml',
      payload: {
        ...device,
        encryptCode: generateEncryptCode(),
      },
    });
  }

  if (device.sn) {
    lookupAttempts.push({
      mode: 'SN',
      endpoint: '/rescueDevice/getNewResourceBySN.jhtml',
      payload: {
        sn: device.sn,
      },
    });
  }

  if (lookupAttempts.length === 0) {
    return {
      ok: false,
      adbAvailable,
      device,
      attempts,
      variants,
      error: 'No IMEI or serial number detected from connected device.',
    };
  }

  for (const lookupAttempt of lookupAttempts) {
    const response = await requestApi(lookupAttempt.endpoint, lookupAttempt.payload);
    const payload = (await response.json()) as {
      code?: string;
      desc?: string;
      content?: LmsaPayloadValue;
    };

    const code = typeof payload.code === 'string' ? payload.code : '';
    const description = typeof payload.desc === 'string' ? payload.desc : '';
    const romUrl = extractRomUrl(payload.content);
    const romMatchIdentifier = extractRomMatchIdentifier(payload.content);
    const recipeUrl = extractRecipeUrl(payload.content);
    const publishDate = extractPublishDate(payload.content);

    attempts.push({
      mode: lookupAttempt.mode,
      code,
      description,
      romUrl: romUrl || undefined,
    });

    const isRescueLiteCandidateCode = code === '0000' || code === '3040';
    if (isRescueLiteCandidateCode && romUrl) {
      variants.push({
        romName: `${device.modelName || 'Connected Device'} (${lookupAttempt.mode})`,
        romUrl,
        romMatchIdentifier,
        recipeUrl: recipeUrl || undefined,
        publishDate: publishDate || '',
        selectedParameters: {
          ...lookupAttempt.payload,
          lmsaCode: code,
        },
      });
    }
  }

  return {
    ok: true,
    adbAvailable,
    device,
    attempts,
    variants,
  };
}

export async function lookupConnectedDeviceFirmware(): Promise<ConnectedLookupResponse> {
  const attemptRead = async (attemptLabel: string, reuseShared = true) => {
    return readConnectedDeviceInfo({
      label: attemptLabel,
      reuseShared: reuseShared ? undefined : false,
    });
  };

  try {
    // Prefer the existing shared Tango session immediately after preview/backup.
    const connectedDevice = await attemptRead('catalog-connected-lookup:read-device-info-shared');
    return lookupConnectedDeviceFirmwareFromDeviceInfo(connectedDevice.device, {
      adbAvailable: connectedDevice.adbAvailable,
    });
  } catch (firstError) {
    const firstDetail = firstError instanceof Error ? firstError.message : String(firstError);

    await resetConnectedDeviceConnection().catch(() => {});
    if (process.platform === 'win32') {
      await Bun.sleep(1_500);
    }
    await waitForConnectedDeviceAvailability({
      timeoutMs: process.platform === 'win32' ? 25_000 : 6_000,
      label: 'catalog-connected-lookup:wait-for-device',
    }).catch(() => {});

    try {
      const connectedDevice = await attemptRead(
        'catalog-connected-lookup:read-device-info-after-reset',
        false,
      );
      return lookupConnectedDeviceFirmwareFromDeviceInfo(connectedDevice.device, {
        adbAvailable: connectedDevice.adbAvailable,
      });
    } catch (secondError) {
      const secondDetail = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(secondDetail || firstDetail || 'Connected lookup via Tango ADB failed.');
    }
  }
}
