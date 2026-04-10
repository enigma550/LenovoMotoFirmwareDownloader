import type { BunRpcRequestHandlers } from '../../../rpc/request-handler-types.ts';
import {
  backupConnectedDevice,
  cancelConnectedBackupProcess,
  getConnectedBackupPreviewProgress,
  restoreBackupSnapshot,
  scanConnectedBackupPreview,
} from '../connected/index.ts';
import { deleteBackupRestoreSnapshot, listBackupRestoreSnapshots } from '../snapshots/index.ts';

export function createBackupRestoreHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'listBackupRestoreSnapshots'
  | 'deleteBackupSnapshot'
  | 'scanConnectedBackupPreview'
  | 'getConnectedBackupPreviewProgress'
  | 'cancelConnectedBackupProcess'
  | 'backupConnectedDevice'
  | 'restoreBackupSnapshot'
> {
  return {
    listBackupRestoreSnapshots: async () => {
      return listBackupRestoreSnapshots();
    },
    deleteBackupSnapshot: async (payload) => {
      return deleteBackupRestoreSnapshot(payload);
    },
    scanConnectedBackupPreview: async () => {
      return scanConnectedBackupPreview();
    },
    getConnectedBackupPreviewProgress: async () => {
      return getConnectedBackupPreviewProgress();
    },
    cancelConnectedBackupProcess: async () => {
      return cancelConnectedBackupProcess();
    },
    backupConnectedDevice: async (payload) => {
      return backupConnectedDevice(payload);
    },
    restoreBackupSnapshot: async (payload) => {
      return restoreBackupSnapshot(payload);
    },
  };
}
