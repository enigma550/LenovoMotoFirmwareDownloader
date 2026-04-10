import type {
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
} from '../../../../shared/desktop-rpc';

const MAX_PREVIEW_PROGRESS_LOGS = 240;

export type ConnectedPreviewProgressState = {
  running: boolean;
  cancelled: boolean;
  runId: number;
  totalApps: number;
  completedApps: number;
  iconsFound: number;
  failedIcons: number;
  logBaseCount: number;
  logCount: number;
  lastLogLine?: string;
  detail?: string;
  currentPackage?: string;
  previewDeviceName?: string;
  previewAndroidVersion?: string;
  apps: BackupRestoreAppEntry[];
  media: BackupRestoreMediaEntry[];
  contacts: BackupRestoreContactEntry[];
  messages: BackupRestoreMessageEntry[];
  files: BackupRestoreFileEntry[];
  categoryErrors: Record<string, string>;
  logs: string[];
};

const connectedPreviewProgressState: ConnectedPreviewProgressState = {
  running: false,
  cancelled: false,
  runId: 0,
  totalApps: 0,
  completedApps: 0,
  iconsFound: 0,
  failedIcons: 0,
  logBaseCount: 0,
  logCount: 0,
  lastLogLine: undefined,
  detail: undefined,
  currentPackage: undefined,
  previewDeviceName: undefined,
  previewAndroidVersion: undefined,
  apps: [],
  media: [],
  contacts: [],
  messages: [],
  files: [],
  categoryErrors: {},
  logs: [],
};

export function setConnectedPreviewProgressState(
  patch: Partial<Omit<ConnectedPreviewProgressState, 'logs'>>,
) {
  Object.assign(connectedPreviewProgressState, patch);
}

export function appendConnectedPreviewLog(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  connectedPreviewProgressState.logs.push(trimmed);
  if (connectedPreviewProgressState.logs.length > MAX_PREVIEW_PROGRESS_LOGS) {
    const removed = connectedPreviewProgressState.logs.length - MAX_PREVIEW_PROGRESS_LOGS;
    connectedPreviewProgressState.logBaseCount += removed;
    connectedPreviewProgressState.logs = connectedPreviewProgressState.logs.slice(
      connectedPreviewProgressState.logs.length - MAX_PREVIEW_PROGRESS_LOGS,
    );
  }

  connectedPreviewProgressState.logCount += 1;
  connectedPreviewProgressState.lastLogLine = trimmed;
}

export function beginConnectedPreviewProgress(totalApps: number) {
  const startingNewRun = !connectedPreviewProgressState.running;

  connectedPreviewProgressState.running = true;
  connectedPreviewProgressState.cancelled = false;
  connectedPreviewProgressState.totalApps = totalApps;
  connectedPreviewProgressState.completedApps = 0;
  connectedPreviewProgressState.iconsFound = 0;
  connectedPreviewProgressState.failedIcons = 0;
  connectedPreviewProgressState.currentPackage = undefined;

  if (!startingNewRun) {
    return;
  }

  connectedPreviewProgressState.runId += 1;
  connectedPreviewProgressState.logBaseCount = 0;
  connectedPreviewProgressState.logCount = 0;
  connectedPreviewProgressState.lastLogLine = undefined;
  connectedPreviewProgressState.detail = 'Connected backup preview scan started.';
  connectedPreviewProgressState.previewDeviceName = undefined;
  connectedPreviewProgressState.previewAndroidVersion = undefined;
  connectedPreviewProgressState.apps = [];
  connectedPreviewProgressState.media = [];
  connectedPreviewProgressState.contacts = [];
  connectedPreviewProgressState.messages = [];
  connectedPreviewProgressState.files = [];
  connectedPreviewProgressState.categoryErrors = {};
  connectedPreviewProgressState.logs = [];
}

export function finishConnectedPreviewProgress(detail: string) {
  setConnectedPreviewProgressState({
    running: false,
    detail,
    currentPackage: undefined,
  });
  appendConnectedPreviewLog(detail);
}

export function failConnectedPreviewProgress(errorDetail: string) {
  setConnectedPreviewProgressState({
    running: false,
    detail: errorDetail,
    currentPackage: undefined,
  });
  appendConnectedPreviewLog(errorDetail);
}

export function getConnectedPreviewProgressState() {
  return connectedPreviewProgressState;
}

export function setCategoryError(category: string, error: string) {
  connectedPreviewProgressState.categoryErrors[category] = error;
}

export function requestConnectedPreviewCancellation() {
  connectedPreviewProgressState.cancelled = true;
  appendConnectedPreviewLog('Cancellation requested.');
}

export function isConnectedPreviewCancelled() {
  return connectedPreviewProgressState.cancelled;
}
