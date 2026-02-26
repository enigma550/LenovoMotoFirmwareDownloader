import { createAuthHandlers } from '../features/auth/rpc/index.ts';
import { createCatalogHandlers } from '../features/catalog/rpc/index.ts';
import {
  createDownloadHandlers,
  createLocalFilesHandlers,
} from '../features/downloads/rpc/index.ts';
import { createRescueHandlers } from '../features/rescue/rpc/index.ts';
import { createSystemHandlers } from '../features/system/rpc/index.ts';
import { RpcHandlerRegistry } from '../rpc/handler-registry.ts';
import type { BunRpcRequestHandlers, DownloadProgressDispatch } from './types.ts';

export function createRequestHandlers(options: {
  sendDownloadProgress: DownloadProgressDispatch;
}): BunRpcRequestHandlers {
  const registry = new RpcHandlerRegistry<BunRpcRequestHandlers>();
  registry.registerMany(createAuthHandlers());
  registry.registerMany(createCatalogHandlers());
  registry.registerMany(createDownloadHandlers(options.sendDownloadProgress));
  registry.registerMany(createRescueHandlers(options.sendDownloadProgress));
  registry.registerMany(createLocalFilesHandlers());
  registry.registerMany(createSystemHandlers());
  return registry.toRecord();
}
