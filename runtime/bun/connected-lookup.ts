import {
  extractPublishDate,
  extractRecipeUrl,
  extractRomMatchIdentifier,
  extractRomUrl,
} from '../../core/features/rescue/index.ts';
import { getDeviceInfo, getDeviceToolAvailability } from '../../core/infra/device/info.ts';
import { requestApi } from '../../core/infra/lmsa/api.ts';
import type { FirmwareVariant } from '../../core/shared/types/index.ts';
import type { ConnectedLookupResponse } from '../shared/rpc.ts';

type LmsaPayloadValue = object | string | number | boolean | null;

function generateEncryptCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function isValidLmsaSerialNumber(serialNumber: string) {
  return /^([a-zA-Z]{1}[a-hj-np-zA-HJ-NP-Z0-9]{7})$/.test(serialNumber);
}

export async function lookupConnectedDeviceFirmware(): Promise<ConnectedLookupResponse> {
  const { adbAvailable, fastbootAvailable } = await getDeviceToolAvailability();
  if (!adbAvailable && !fastbootAvailable) {
    return {
      ok: false,
      adbAvailable,
      fastbootAvailable,
      attempts: [],
      variants: [],
      error: 'Neither adb nor fastboot was found in PATH.',
    };
  }

  const device = await getDeviceInfo();
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
      fastbootAvailable,
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
    fastbootAvailable,
    device,
    attempts,
    variants,
  };
}
