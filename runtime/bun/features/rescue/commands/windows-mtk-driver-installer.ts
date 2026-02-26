import type { WindowsMtkDriverInstallResponse } from '../../../../shared/rpc.ts';
import {
  resolveBundledDriverExePath,
  runBundledDriverExeWithUac,
} from './windows-driver-installer-shared.ts';

export async function installWindowsMtkDriverManually(): Promise<WindowsMtkDriverInstallResponse> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      attempted: false,
      method: 'mtk-setup',
      error: 'Manual MediaTek driver install is only available on Windows.',
      detail: 'Windows-only action.',
    };
  }

  const installerPath = resolveBundledDriverExePath({
    installerSubDir: 'mtk',
    preferredFileNames: ['mtk_driver.exe', 'MTK_Driver.exe', 'mediatek_driver.exe'],
  });
  if (!installerPath) {
    return {
      ok: false,
      attempted: false,
      method: 'mtk-setup',
      error: 'Bundled MediaTek driver installer not found.',
      detail: 'Place mtk_driver.exe at assets/tools/drivers/win32-x64/mtk/mtk_driver.exe',
    };
  }

  return runBundledDriverExeWithUac({
    installerPath,
    method: 'mtk-setup',
  }) as Promise<WindowsMtkDriverInstallResponse>;
}
