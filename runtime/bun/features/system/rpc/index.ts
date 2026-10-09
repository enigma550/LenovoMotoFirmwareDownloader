import {
  checkDesktopIntegration,
  createDesktopIntegration,
  getAppInfo,
  getDesktopPromptPreference,
  restoreSoftwareFixProtocolHandler,
  setDesktopPromptPreference,
  switchSoftwareFixProtocolToLmfd,
} from '../../../desktop-integration.ts';
import type { BunRpcRequestHandlers } from '../../../rpc/request-handler-types.ts';
import { cleanExtractedFirmwares, getStorageUsage } from '../../downloads/storage-management.ts';
import { installWindowsMtkDriverManually } from '../../rescue/commands/windows-mtk-driver-installer.ts';
import {
  getWindowsQdloaderDriverStatus,
  installWindowsQdloaderDriverManually,
} from '../../rescue/commands/windows-qdloader-driver-installer.ts';
import { installWindowsSpdDriverManually } from '../../rescue/commands/windows-spd-driver-installer.ts';
import {
  applyFrameworkUpdate,
  checkFrameworkUpdate,
  downloadFrameworkUpdate,
} from '../../update/framework-updater.ts';
import { checkLinuxUdevRules, installLinuxUdevRules } from '../udev-rules.ts';

export function createSystemHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'checkDesktopIntegration'
  | 'createDesktopIntegration'
  | 'getDesktopPromptPreference'
  | 'setDesktopPromptPreference'
  | 'getAppInfo'
  | 'switchSoftwareFixProtocolToLmfd'
  | 'restoreSoftwareFixProtocolHandler'
  | 'checkFrameworkUpdate'
  | 'downloadFrameworkUpdate'
  | 'applyFrameworkUpdate'
  | 'getWindowsQdloaderDriverStatus'
  | 'installWindowsQdloaderDriver'
  | 'installWindowsSpdDriver'
  | 'installWindowsMtkDriver'
  | 'getLinuxUdevStatus'
  | 'installLinuxUdevRules'
  | 'getStorageUsage'
  | 'cleanExtractedFirmwares'
> {
  return {
    checkDesktopIntegration: async () => {
      return checkDesktopIntegration();
    },
    createDesktopIntegration: async () => {
      return createDesktopIntegration();
    },
    getDesktopPromptPreference: async () => {
      const ask = await getDesktopPromptPreference();
      return {
        ok: true,
        ask,
      };
    },
    setDesktopPromptPreference: async ({ ask }) => {
      const updatedAsk = await setDesktopPromptPreference(ask);
      return {
        ok: true,
        ask: updatedAsk,
      };
    },
    getAppInfo: async () => {
      return getAppInfo();
    },
    switchSoftwareFixProtocolToLmfd: async () => {
      return switchSoftwareFixProtocolToLmfd();
    },
    restoreSoftwareFixProtocolHandler: async () => {
      return restoreSoftwareFixProtocolHandler();
    },
    checkFrameworkUpdate: async () => {
      return await checkFrameworkUpdate();
    },
    downloadFrameworkUpdate: async () => {
      await downloadFrameworkUpdate();
    },
    applyFrameworkUpdate: async () => {
      await applyFrameworkUpdate();
    },
    getWindowsQdloaderDriverStatus: async () => {
      return getWindowsQdloaderDriverStatus();
    },
    installWindowsQdloaderDriver: async () => {
      return installWindowsQdloaderDriverManually();
    },
    installWindowsSpdDriver: async () => {
      return installWindowsSpdDriverManually();
    },
    installWindowsMtkDriver: async () => {
      return installWindowsMtkDriverManually();
    },
    getLinuxUdevStatus: async () => {
      return checkLinuxUdevRules();
    },
    installLinuxUdevRules: async () => {
      return installLinuxUdevRules();
    },
    getStorageUsage: async () => {
      return getStorageUsage();
    },
    cleanExtractedFirmwares: async () => {
      return cleanExtractedFirmwares();
    },
  };
}
