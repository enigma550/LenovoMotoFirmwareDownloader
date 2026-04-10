import {
  readConnectedDeviceInfo,
  waitForConnectedDeviceAvailability,
  withConnectedDeviceConnection,
} from '../../../device/connected-device-facade.ts';
import {
  parseApkPaths,
  parsePackageList,
  parsePackageListWithPrimaryApkPaths,
  prioritizeApkPaths,
} from './connected-backups-adb-cli.ts';
import { runCommand, withSharedAdbCommandSession } from './connected-backups-adb-transport.ts';

export { runCommand, withSharedAdbCommandSession };

import { appendConnectedPreviewLog } from './connected-backups-progress.ts';
import type { ConnectedDeviceInfo, InstalledPackageInfo } from './connected-backups-shared.ts';

type ConnectedDeviceReadOptions = {
  reuseShared?: boolean;
};

/**
 * Connected backup ADB facade.
 *
 * The public surface intentionally keeps the existing "adb" terminology because
 * the surrounding backup modules are still organized around ADB-style actions.
 * Internally, the implementation routes through the runtime Tango transport
 * facade and shared session helpers instead of shelling out to a standalone adb
 * binary for the primary device connection flow.
 */
export async function checkAdbConnected(appendLog?: (line: string) => void, signal?: AbortSignal) {
  if (signal?.aborted) {
    return { connected: false, detail: 'Cancelled by user.' };
  }

  try {
    await withConnectedDeviceConnection(async () => undefined, {
      label: 'backup:check-connected',
      reuseShared: false,
    });
    return {
      connected: true,
      detail: 'Connected device detected via Tango ADB.',
    };
  } catch (error) {
    if (signal?.aborted) {
      return { connected: false, detail: 'Cancelled by user.' };
    }

    const detail = error instanceof Error ? error.message : String(error);
    const lower = detail.toLowerCase();
    const hasUsbTransferFailure = lower.includes('libusb_transfer_');
    const hasUsbBusy =
      lower.includes('libusb_error_busy') ||
      (lower.includes('usb device') && lower.includes(' is busy')) ||
      lower.includes('locked by');
    const hasNoUsbDevice = lower.includes('no direct usb adb device detected');
    const hasUnauthorizedServerDevice = lower.includes('no authorized adb server device detected');
    const hasAuthenticationPending =
      lower.includes('adb authentication did not complete') ||
      (lower.includes('usb debugging prompt') && lower.includes('approve'));
    const shouldWait =
      hasUsbTransferFailure || hasUsbBusy || hasNoUsbDevice || hasUnauthorizedServerDevice;

    if (hasAuthenticationPending) {
      const authorizationDetail =
        'Android device detected, but ADB authentication is still not complete. Unlock the phone and approve the USB debugging prompt, then try again.';
      appendLog?.(authorizationDetail);
      return { connected: false, detail: authorizationDetail };
    }

    if (shouldWait) {
      const waitingMessage = hasUsbBusy
        ? `USB connection is busy. Unplug and reconnect the phone, then try again. ${detail}`
        : hasUsbTransferFailure
          ? 'Device not ready yet. Unlock the phone and manually approve the USB debugging request on the phone if it is shown. If the phone is still not detected, try unplugging and reconnecting the USB cable. Waiting for Tango ADB to report an available device...'
          : hasUnauthorizedServerDevice
            ? 'ADB server does not currently expose an authorized Android device. If a phone is connected, manually approve the USB debugging request on the phone if it is shown. Otherwise connect a device and wait for Tango ADB to report it as available...'
            : 'Device not ready yet. If the phone shows a USB debugging prompt, manually approve it on the phone. Waiting for Tango ADB to report an available device...';
      appendLog?.(waitingMessage);
      try {
        await waitForConnectedDeviceAvailability({
          timeoutMs: 15000,
          signal,
          label: 'backup:wait-for-device',
        });
        appendLog?.(
          'An Android device became visible. Attempting to establish an ADB connection now...',
        );
        await withConnectedDeviceConnection(async () => undefined, {
          label: 'backup:check-connected-after-wait',
          reuseShared: false,
        });
        return {
          connected: true,
          detail: 'Connected device detected via Tango ADB.',
        };
      } catch (waitError) {
        const waitDetail = waitError instanceof Error ? waitError.message : String(waitError);
        if (signal?.aborted || waitDetail.toLowerCase().includes('aborted')) {
          return { connected: false, detail: 'Cancelled by user.' };
        }
        if (
          waitDetail.toLowerCase().includes('libusb_error_busy') ||
          (waitDetail.toLowerCase().includes('usb device') &&
            waitDetail.toLowerCase().includes(' is busy')) ||
          waitDetail.toLowerCase().includes('locked by')
        ) {
          const busyDetail = `USB connection is still busy. Unplug and reconnect the phone, then try again. ${waitDetail}`;
          appendLog?.(busyDetail);
          return { connected: false, detail: busyDetail };
        }
        if (
          waitDetail.toLowerCase().includes('unauthorized') ||
          waitDetail.toLowerCase().includes('auth') ||
          waitDetail.toLowerCase().includes('credential')
        ) {
          const authorizationDetail =
            'Android device detected, but ADB authentication is still not complete. Unlock the phone and approve the USB debugging prompt, then try again.';
          appendLog?.(authorizationDetail);
          return { connected: false, detail: authorizationDetail };
        }
        appendLog?.(waitDetail || detail);
        return { connected: false, detail: waitDetail || detail };
      }
    }

    appendLog?.(detail);
    return { connected: false, detail };
  }
}

export async function getConnectedDeviceInfo(
  options?: ConnectedDeviceReadOptions,
): Promise<ConnectedDeviceInfo> {
  try {
    const connectedDevice = await readConnectedDeviceInfo({
      label: 'backup:get-device-info',
      includeImei: false,
      reuseShared: options?.reuseShared === true ? undefined : false,
    });
    const versionResult = await runCommand('adb', ['shell', 'getprop', 'ro.build.version.release']);
    return {
      model: connectedDevice.device.modelName || 'Android device',
      androidVersion: versionResult.stdoutText.trim() || '',
    };
  } catch {
    const modelResult = await runCommand('adb', ['shell', 'getprop', 'ro.product.model']);
    const versionResult = await runCommand('adb', ['shell', 'getprop', 'ro.build.version.release']);

    const model = modelResult.stdoutText.trim() || 'Android device';
    const androidVersion = versionResult.stdoutText.trim() || '';
    return { model, androidVersion };
  }
}

export async function getConnectedDeviceCacheScope(
  options?: ConnectedDeviceReadOptions,
): Promise<string> {
  try {
    const connectedDevice = await readConnectedDeviceInfo({
      label: 'backup:get-device-cache-scope',
      includeImei: false,
      reuseShared: options?.reuseShared === true ? undefined : false,
    });
    const stableIdentifier =
      connectedDevice.device.imei ||
      connectedDevice.device.sn ||
      connectedDevice.device.modelCode ||
      connectedDevice.device.modelName;

    return [connectedDevice.transportKind, stableIdentifier].filter(Boolean).join(':');
  } catch {
    const fallback = await getConnectedDeviceInfo(options);
    return `fallback:${fallback.model}:${fallback.androidVersion}`;
  }
}

export async function getInstalledPackages() {
  const thirdParty = await runCommand('adb', ['shell', 'pm', 'list', 'packages', '-3']);
  if (thirdParty.exitCode !== 0 && thirdParty.error) {
    appendConnectedPreviewLog(`Apps scan: pm list packages -3 failed (${thirdParty.error}).`);
  }
  const thirdPartyPackages = parsePackageList(thirdParty.stdoutText);
  if (thirdPartyPackages.length > 0) {
    return thirdPartyPackages;
  }

  const allPackages = await runCommand('adb', ['shell', 'pm', 'list', 'packages']);
  if (allPackages.exitCode !== 0 && allPackages.error) {
    appendConnectedPreviewLog(`Apps scan: pm list packages failed (${allPackages.error}).`);
  }
  const allParsed = parsePackageList(allPackages.stdoutText);
  if (allParsed.length > 0) {
    return allParsed;
  }

  const cmdThirdParty = await runCommand('adb', [
    'shell',
    'cmd',
    'package',
    'list',
    'packages',
    '-3',
  ]);
  if (cmdThirdParty.exitCode !== 0 && cmdThirdParty.error) {
    appendConnectedPreviewLog(
      `Apps scan: cmd package list packages -3 failed (${cmdThirdParty.error}).`,
    );
  }
  const cmdThirdPartyPackages = parsePackageList(cmdThirdParty.stdoutText);
  if (cmdThirdPartyPackages.length > 0) {
    return cmdThirdPartyPackages;
  }

  const cmdAll = await runCommand('adb', ['shell', 'cmd', 'package', 'list', 'packages']);
  if (cmdAll.exitCode !== 0 && cmdAll.error) {
    appendConnectedPreviewLog(`Apps scan: cmd package list packages failed (${cmdAll.error}).`);
  }
  const cmdAllParsed = parsePackageList(cmdAll.stdoutText);
  if (cmdAllParsed.length === 0) {
    appendConnectedPreviewLog('Apps scan: no packages returned by pm or cmd package.');
  }
  return cmdAllParsed;
}

export async function getInstalledPackagesWithPrimaryApkPaths(): Promise<InstalledPackageInfo[]> {
  const thirdParty = await runCommand('adb', ['shell', 'pm', 'list', 'packages', '-3', '-f']);
  if (thirdParty.exitCode !== 0 && thirdParty.error) {
    appendConnectedPreviewLog(`Apps scan: pm list packages -3 -f failed (${thirdParty.error}).`);
  }
  const thirdPartyPackages = parsePackageListWithPrimaryApkPaths(thirdParty.stdoutText);
  if (thirdPartyPackages.length > 0) {
    return thirdPartyPackages;
  }

  const allPackages = await runCommand('adb', ['shell', 'pm', 'list', 'packages', '-f']);
  if (allPackages.exitCode !== 0 && allPackages.error) {
    appendConnectedPreviewLog(`Apps scan: pm list packages -f failed (${allPackages.error}).`);
  }
  const allPackageInfos = parsePackageListWithPrimaryApkPaths(allPackages.stdoutText);
  if (allPackageInfos.length > 0) {
    return allPackageInfos;
  }

  const cmdThirdParty = await runCommand('adb', [
    'shell',
    'cmd',
    'package',
    'list',
    'packages',
    '-3',
    '-f',
  ]);
  if (cmdThirdParty.exitCode !== 0 && cmdThirdParty.error) {
    appendConnectedPreviewLog(
      `Apps scan: cmd package list packages -3 -f failed (${cmdThirdParty.error}).`,
    );
  }
  const cmdThirdPartyPackages = parsePackageListWithPrimaryApkPaths(cmdThirdParty.stdoutText);
  if (cmdThirdPartyPackages.length > 0) {
    return cmdThirdPartyPackages;
  }

  const cmdAll = await runCommand('adb', ['shell', 'cmd', 'package', 'list', 'packages', '-f']);
  if (cmdAll.exitCode !== 0 && cmdAll.error) {
    appendConnectedPreviewLog(`Apps scan: cmd package list packages -f failed (${cmdAll.error}).`);
  }
  const cmdAllInfos = parsePackageListWithPrimaryApkPaths(cmdAll.stdoutText);
  if (cmdAllInfos.length > 0) {
    return cmdAllInfos;
  }

  const fallbackPackages = parsePackageList(allPackages.stdoutText);
  if (fallbackPackages.length === 0) {
    appendConnectedPreviewLog('Apps scan: no packages returned by pm/cmd package (with -f).');
  }
  return fallbackPackages.map((packageName) => ({
    packageName,
    primaryApkPath: undefined,
  }));
}

export async function getPackageApkPaths(packageName: string) {
  const packagePathResult = await runCommand('adb', ['shell', 'pm', 'path', packageName], 60_000);
  if (packagePathResult.exitCode !== 0) {
    return [] as string[];
  }

  return prioritizeApkPaths(parseApkPaths(packagePathResult.stdoutText));
}

export async function pullSingleRemoteApk(
  remoteApkPath: string,
  outputApkPath: string,
  timeoutMs: number,
) {
  const firstPullResult = await runCommand(
    'adb',
    ['pull', remoteApkPath, outputApkPath],
    timeoutMs,
  );
  if (firstPullResult.exitCode === 0) {
    return true;
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
  const retryPullResult = await runCommand(
    'adb',
    ['pull', remoteApkPath, outputApkPath],
    timeoutMs,
  );
  if (retryPullResult.exitCode !== 0) {
    return false;
  }

  return true;
}
