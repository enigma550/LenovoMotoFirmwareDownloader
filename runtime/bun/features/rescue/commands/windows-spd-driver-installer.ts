import type { WindowsSpdDriverInstallResponse } from '../../../../shared/rpc.ts';
import {
  resolveBundledDriverExePath,
  runBundledDriverExeWithUac,
} from './windows-driver-installer-shared.ts';

export async function installWindowsSpdDriverManually(): Promise<WindowsSpdDriverInstallResponse> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      attempted: false,
      method: 'spd-setup',
      error: 'Manual SPD driver install is only available on Windows.',
      detail: 'Windows-only action.',
    };
  }

  const installerPath = resolveBundledDriverExePath({
    installerSubDir: 'spd',
    preferredFileNames: ['spd_driver_v2.exe', 'SPD_Driver_v2.exe', 'spd_driver.exe'],
  });
  if (!installerPath) {
    return {
      ok: false,
      attempted: false,
      method: 'spd-setup',
      error: 'Bundled SPD driver installer not found.',
      detail: 'Place spd_driver_v2.exe at assets/tools/drivers/win32-x64/spd/spd_driver_v2.exe',
    };
  }

  return runBundledDriverExeWithUac({
    installerPath,
    method: 'spd-setup',
  }) as Promise<WindowsSpdDriverInstallResponse>;
}
