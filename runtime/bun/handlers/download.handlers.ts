import {
  cancelActiveDownload,
  downloadFirmwareWithProgress,
  pauseActiveDownload,
  resumePausedDownload,
} from '../download-manager.ts';
import { cancelActiveRescue } from '../features/rescue/rescue-manager.ts';
import type { BunRpcRequestHandlers, DownloadProgressDispatch } from './types.ts';

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
