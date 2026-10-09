import type {
  BunRpcRequestHandlers,
  DownloadProgressDispatch,
} from '../../../rpc/request-handler-types.ts';
import { probeFastbootDeviceHealth } from '../connected/fastboot-device-probe.ts';
import { extractLocalFirmwarePackage, rescueLiteFirmwareWithProgress } from '../rescue-manager.ts';

export function createRescueHandlers(
  sendDownloadProgress: DownloadProgressDispatch,
): Pick<
  BunRpcRequestHandlers,
  | 'rescueLiteFirmware'
  | 'rescueLiteFirmwareFromLocal'
  | 'extractLocalFirmware'
  | 'probeFastbootDeviceHealth'
> {
  return {
    rescueLiteFirmware: async ({
      downloadId,
      romUrl,
      romName,
      publishDate,
      selectedParameters,
      romMatchIdentifier,
      recipeUrl,
      dataReset,
      dryRun,
      flashTransport,
      qdlStorage,
      qdlSerial,
    }) => {
      return rescueLiteFirmwareWithProgress(
        {
          downloadId,
          romUrl,
          romName,
          publishDate,
          selectedParameters,
          romMatchIdentifier,
          recipeUrl,
          dataReset,
          dryRun,
          flashTransport,
          qdlStorage,
          qdlSerial,
        },
        (progressEvent) => {
          sendDownloadProgress(progressEvent);
        },
      );
    },
    rescueLiteFirmwareFromLocal: async ({
      downloadId,
      filePath,
      fileName,
      extractedDir,
      publishDate,
      selectedParameters,
      romMatchIdentifier,
      recipeUrl,
      dataReset,
      dryRun,
      flashTransport,
      qdlStorage,
      qdlSerial,
    }) => {
      return rescueLiteFirmwareWithProgress(
        {
          downloadId,
          romUrl: filePath,
          romName: fileName,
          publishDate,
          selectedParameters,
          romMatchIdentifier,
          recipeUrl,
          dataReset,
          dryRun,
          flashTransport,
          qdlStorage,
          qdlSerial,
          localPackagePath: filePath,
          localExtractedDir: extractedDir,
        },
        (progressEvent) => {
          sendDownloadProgress(progressEvent);
        },
      );
    },
    extractLocalFirmware: async ({ filePath, fileName, extractedDir }) => {
      return extractLocalFirmwarePackage(
        {
          filePath,
          fileName,
          extractedDir,
        },
        (progressEvent) => {
          sendDownloadProgress(progressEvent);
        },
      );
    },
    probeFastbootDeviceHealth: async () => {
      return probeFastbootDeviceHealth();
    },
  };
}
