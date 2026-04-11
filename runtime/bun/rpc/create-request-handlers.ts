import { createAppStoreHandlers } from '../features/app-store/rpc/index.ts';
import { createAuthHandlers } from '../features/auth/rpc/index.ts';
import { createBackupRestoreHandlers } from '../features/backup-restore/rpc/index.ts';
import { createCatalogHandlers } from '../features/catalog/rpc/index.ts';
import {
  createDownloadHandlers,
  createDownloadLocalFileHandlers,
} from '../features/downloads/rpc/index.ts';
import { createRescueHandlers } from '../features/rescue/rpc/index.ts';
import { createSystemHandlers } from '../features/system/rpc/index.ts';
import { RpcHandlerRegistry } from './handler-registry.ts';
import type { BunRpcRequestHandlers, DownloadProgressDispatch } from './request-handler-types.ts';

export function createRequestHandlers(options: {
  sendDownloadProgress: DownloadProgressDispatch;
  getMainWindow?: () => {
    renderer?: 'native' | 'cef';
    maximize?: () => void;
    focus?: () => void;
    webview?: {
      on: (eventName: string, callback: (event?: unknown) => void) => void;
      loadURL: (url: string) => void;
    };
  } | null;
  getMainWindowUrl?: () => string;
}): BunRpcRequestHandlers {
  const registry = new RpcHandlerRegistry<BunRpcRequestHandlers>();
  registry.registerMany(
    createAuthHandlers({
      getMainWindow: options.getMainWindow,
      getMainWindowUrl: options.getMainWindowUrl,
    }),
  );
  registry.registerMany(createAppStoreHandlers());
  registry.registerMany(createCatalogHandlers());
  registry.registerMany(createDownloadHandlers(options.sendDownloadProgress));
  registry.registerMany(createDownloadLocalFileHandlers());
  registry.registerMany(createBackupRestoreHandlers());
  registry.registerMany(createRescueHandlers(options.sendDownloadProgress));
  registry.registerMany(createSystemHandlers());
  return registry.toRecord();
}
