import type { BunRpcRequestHandlers } from '../../../rpc/request-handler-types.ts';
import {
  downloadPlayStoreApp,
  getPlayStoreAppDetails,
  getPlayStoreStatus,
  installPlayStoreApp,
  listPlayStoreDownloads,
  searchPlayStoreApps,
} from '../play-store.ts';

export function createAppStoreHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'getPlayStoreStatus'
  | 'listPlayStoreDownloads'
  | 'searchPlayStoreApps'
  | 'getPlayStoreAppDetails'
  | 'downloadPlayStoreApp'
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
      return downloadPlayStoreApp(payload);
    },
    installPlayStoreApp: async (payload) => {
      return installPlayStoreApp(payload);
    },
  };
}
