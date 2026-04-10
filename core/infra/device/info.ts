import { $ } from 'bun';
import type { DeviceInfo } from '../../domain/device/info.ts';
import { environmentVariables } from '../lmsa/state.ts';

async function commandExists(commandName: string) {
  const response = await $`which ${commandName}`.quiet().nothrow();
  return response.exitCode === 0;
}

export async function getDeviceToolAvailability() {
  const adbAvailable = await commandExists('adb');
  return {
    adbAvailable,
  };
}

async function getImeiFromAdb() {
  await $`adb root`.quiet().nothrow();
  const response = await $`adb shell service call iphonesubinfo 1 s16 "com.android.shell"`
    .quiet()
    .nothrow();

  const output = response.stdout.toString();
  const matches = output.match(/'([^']+)'/g);
  if (!matches) return '';

  const rawHex = matches.join('');
  const cleanImei = rawHex.replace(/[^0-9]/g, '');
  return cleanImei.substring(0, 15);
}

export async function getDeviceInfo() {
  const adbStateResponse = await $`adb get-state`.quiet().nothrow();
  const adbStatus = adbStateResponse.stdout.toString();

  if (!adbStatus.includes('device')) {
    throw new Error(
      'ADB device not available. Connected lookup requires an authorized ADB device.',
    );
  }

  console.log('[INFO] Device detected via ADB...');
  const propertiesResponse = await $`adb shell getprop`.quiet().nothrow();
  const propertiesText = propertiesResponse.stdout.toString();

  const properties = new Map(
    propertiesText
      .split('\n')
      .map((line) => line.match(/\[([^\]]+)\]: \[([^\]]+)\]/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );

  const imei = environmentVariables.LMSA_IMEI || (await getImeiFromAdb());

  return {
    imei,
    modelName:
      environmentVariables.LMSA_MODEL_NAME ||
      properties.get('ro.product.model') ||
      'Motorola Device',
    modelCode:
      environmentVariables.LMSA_MODEL_CODE ||
      properties.get('ro.boot.hardware.sku') ||
      properties.get('ro.build.product') ||
      '',
    sn: environmentVariables.LMSA_SN || properties.get('ro.serialno') || '',
    roCarrier: environmentVariables.LMSA_RO_CARRIER || properties.get('ro.carrier') || 'reteu',
  } as DeviceInfo;
}
