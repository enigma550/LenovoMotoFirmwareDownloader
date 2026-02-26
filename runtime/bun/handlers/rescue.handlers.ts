import {
  extractLocalFirmwarePackage,
  rescueLiteFirmwareWithProgress,
} from '../features/rescue/rescue-manager.ts';
import type { BunRpcRequestHandlers, DownloadProgressDispatch } from './types.ts';

export function createRescueHandlers(
  sendDownloadProgress: DownloadProgressDispatch,
): Pick<
  BunRpcRequestHandlers,
  'rescueLiteFirmware' | 'rescueLiteFirmwareFromLocal' | 'extractLocalFirmware'
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
      return extractLocalFirmwarePackage({
        filePath,
        fileName,
        extractedDir,
      });
    },
  };
}
