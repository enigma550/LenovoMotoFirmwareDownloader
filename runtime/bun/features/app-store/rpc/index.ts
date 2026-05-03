import type {
  BunRpcRequestHandlers,
  DownloadProgressDispatch,
} from '../../../rpc/request-handler-types.ts';
import {
  deletePlayStoreDownload,
  downloadPlayStoreApp,
  getPlayStoreAppDetails,
  getPlayStoreStatus,
  installPlayStoreApp,
  listPlayStoreDownloads,
  searchPlayStoreApps,
} from '../play-store.ts';

export function createAppStoreHandlers(options: {
  sendDownloadProgress: DownloadProgressDispatch;
}): Pick<
  BunRpcRequestHandlers,
  | 'getPlayStoreStatus'
  | 'listPlayStoreDownloads'
  | 'searchPlayStoreApps'
  | 'getPlayStoreAppDetails'
  | 'downloadPlayStoreApp'
  | 'deletePlayStoreDownload'
  | 'installPlayStoreApp'
> {
  return {
    getPlayStoreStatus: async () => {
      return getPlayStoreStatus();
    },
    listPlayStoreDownloads: async () => {
      return listPlayStoreDownloads();
    },
    searchPlayStoreApps: async (payload) => {
      return searchPlayStoreApps(payload);
    },
    getPlayStoreAppDetails: async (payload) => {
      return getPlayStoreAppDetails(payload);
    },
    downloadPlayStoreApp: async (payload) => {
      return downloadPlayStoreApp(payload, options.sendDownloadProgress);
    },
    deletePlayStoreDownload: async (payload) => {
      return deletePlayStoreDownload(payload);
    },
    installPlayStoreApp: async (payload) => {
      return installPlayStoreApp(payload);
    },
  };
}
