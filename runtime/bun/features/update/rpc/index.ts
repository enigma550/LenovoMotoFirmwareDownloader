import type {
  BunRpcRequestHandlers,
  UpdateProgressDispatch,
} from '../../../rpc/request-handler-types.ts';
import { UpdateLogger } from '../update-logger.ts';
import {
  cancelProjectUpdate,
  checkProjectUpdate,
  getProjectUpdateLog,
  startProjectUpdate,
} from '../update-orchestrator.ts';

export function createUpdateHandlers(
  sendUpdateProgress: UpdateProgressDispatch,
): Pick<
  BunRpcRequestHandlers,
  'checkProjectUpdate' | 'startProjectUpdate' | 'cancelProjectUpdate' | 'getProjectUpdateLog'
> {
  return {
    checkProjectUpdate: async () => {
      const logger = new UpdateLogger('check');
      return checkProjectUpdate(logger);
    },
    startProjectUpdate: async (payload) => {
      const logger = new UpdateLogger('apply');
      return startProjectUpdate(payload, sendUpdateProgress, logger);
    },
    cancelProjectUpdate: async () => {
      return cancelProjectUpdate();
    },
    getProjectUpdateLog: async () => {
      return getProjectUpdateLog();
    },
  };
}
