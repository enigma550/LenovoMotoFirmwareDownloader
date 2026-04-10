import {
  cancelActiveDownload,
  downloadFirmwareWithProgress,
  pauseActiveDownload,
  resumePausedDownload,
} from '../../../download-manager.ts';
import {
  attachLocalRecipeFromModel,
  attachLocalRecipeMetadata,
  deleteLocalFile,
  listLocalDownloadedFiles,
  readLocalFileContent,
} from '../../../local-downloads.ts';
import type {
  BunRpcRequestHandlers,
  DownloadProgressDispatch,
} from '../../../rpc/request-handler-types.ts';
import { cancelActiveRescue } from '../../rescue/rescue-manager.ts';

export function createDownloadHandlers(
  sendDownloadProgress: DownloadProgressDispatch,
): Pick<
  BunRpcRequestHandlers,
  'downloadFirmware' | 'cancelDownload' | 'pauseDownload' | 'resumeDownload'
> {
  return {
    downloadFirmware: async ({
      downloadId,
      romUrl,
      romName,
      publishDate,
      romMatchIdentifier,
      selectedParameters,
      recipeUrl,
    }) => {
      return downloadFirmwareWithProgress(
        {
          downloadId,
          romUrl,
          romName,
          publishDate,
          romMatchIdentifier,
          selectedParameters,
          recipeUrl,
          notifyOnCompletion: true,
        },
        (progressEvent) => {
          sendDownloadProgress(progressEvent);
        },
      );
    },
    cancelDownload: async ({ downloadId }) => {
      const canceledDownload = cancelActiveDownload(downloadId);
      if (canceledDownload.ok) {
        return canceledDownload;
      }

      if (cancelActiveRescue(downloadId)) {
        return {
          ok: true,
          downloadId,
          status: 'canceling',
        } as const;
      }

      return canceledDownload;
    },
    pauseDownload: async ({ downloadId }: { downloadId: string }) => {
      return pauseActiveDownload(downloadId);
    },
    resumeDownload: async ({ downloadId }: { downloadId: string }) => {
      return resumePausedDownload(downloadId, (progress) => {
        sendDownloadProgress(progress);
      });
    },
  };
}

export function createDownloadLocalFileHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'listLocalDownloadedFiles'
  | 'attachLocalRecipeFromModel'
  | 'attachLocalRecipeMetadata'
  | 'readLocalFileContent'
  | 'deleteLocalFile'
> {
  return {
    listLocalDownloadedFiles: async () => {
      return listLocalDownloadedFiles();
    },
    attachLocalRecipeFromModel: async ({ filePath, fileName, modelName, marketName, category }) => {
      return attachLocalRecipeFromModel({
        filePath,
        fileName,
        modelName,
        marketName,
        category,
      });
    },
    attachLocalRecipeMetadata: async ({
      filePath,
      fileName,
      recipeUrl,
      romName,
      romUrl,
      publishDate,
      romMatchIdentifier,
      selectedParameters,
      source,
    }) => {
      return attachLocalRecipeMetadata({
        filePath,
        fileName,
        recipeUrl,
        romName,
        romUrl,
        publishDate,
        romMatchIdentifier,
        selectedParameters,
        source,
      });
    },
    readLocalFileContent: async ({ filePath, encoding }) => {
      return readLocalFileContent({ filePath, encoding });
    },
    deleteLocalFile: async ({ filePath }: { filePath: string }) => {
      return deleteLocalFile({ filePath });
    },
  };
}
