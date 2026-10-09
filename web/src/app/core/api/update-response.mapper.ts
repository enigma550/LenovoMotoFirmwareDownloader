/**
 * Update response mappers — defensive parsing of project-update RPC payloads.
 */
import type {
  CancelProjectUpdateResponse,
  CheckProjectUpdateResponse,
  GetProjectUpdateLogResponse,
  ProjectUpdateCommit,
  ProjectUpdateCredentialStatus,
  ProjectUpdateErrorCode,
  ProjectUpdateMode,
  ProjectUpdatePreflight,
  ProjectUpdateProgressMessage,
  ProjectUpdateTone,
  StartProjectUpdateResponse,
} from '../models/desktop-api';
import {
  asRecord,
  type MapperValue,
  readBoolean,
  readNumber,
  readOptionalString,
  readString,
  readStringArray,
} from './mapper-utils';

const updateModeValues = new Set<ProjectUpdateMode>(['source', 'packaged']);

const updatePhaseValues = new Set<ProjectUpdateProgressMessage['phase']>([
  'preflight',
  'fetch',
  'sync',
  'dependencies',
  'build',
  'finalize',
  'done',
  'failed',
  'canceled',
]);

const updateStatusValues = new Set<ProjectUpdateProgressMessage['status']>([
  'starting',
  'running',
  'completed',
  'failed',
  'canceled',
]);

const updateToneValues = new Set<ProjectUpdateTone>(['info', 'success', 'warning', 'error']);

const credentialStatusValues = new Set<ProjectUpdateCredentialStatus>([
  'ok',
  'not-applicable',
  'auth-failed',
  'network-failed',
  'missing-remote',
  'unknown',
]);

const errorCodeValues = new Set<ProjectUpdateErrorCode>([
  'NOT_A_SOURCE_CHECKOUT',
  'GIT_MISSING',
  'AUTH_FAILED',
  'NETWORK_FAILED',
  'MISSING_REMOTE',
  'DIRTY_TREE',
  'DIVERGED',
  'NOTHING_TO_UPDATE',
  'UPDATE_IN_PROGRESS',
  'UPDATE_NOT_AVAILABLE',
  'MERGE_FAILED',
  'DEPENDENCY_FAILED',
  'BUILD_FAILED',
  'CANCELED',
  'UNKNOWN',
]);

function readUpdateMode(value: MapperValue): ProjectUpdateMode {
  return typeof value === 'string' && updateModeValues.has(value as ProjectUpdateMode)
    ? (value as ProjectUpdateMode)
    : 'packaged';
}

function readUpdateErrorCode(value: MapperValue): ProjectUpdateErrorCode | undefined {
  return typeof value === 'string' && errorCodeValues.has(value as ProjectUpdateErrorCode)
    ? (value as ProjectUpdateErrorCode)
    : undefined;
}

function readIncomingCommits(value: MapperValue): ProjectUpdateCommit[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const commits: ProjectUpdateCommit[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    commits.push({
      sha: readString(record, 'sha'),
      summary: readString(record, 'summary'),
      author: readString(record, 'author'),
      date: readString(record, 'date'),
    });
  }
  return commits;
}

export function mapProjectUpdatePreflight(value: MapperValue): ProjectUpdatePreflight | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const credentialRaw = readString(record, 'credentialStatus', 'unknown');
  return {
    mode: readUpdateMode(record['mode']),
    available: readBoolean(record, 'available'),
    reason: readOptionalString(record, 'reason'),
    currentBranch: readOptionalString(record, 'currentBranch'),
    currentCommit: readOptionalString(record, 'currentCommit'),
    remoteUrl: readOptionalString(record, 'remoteUrl'),
    behindCount: readNumber(record, 'behindCount'),
    aheadCount: readNumber(record, 'aheadCount'),
    upToDate: readBoolean(record, 'upToDate'),
    diverged: readBoolean(record, 'diverged'),
    incomingCommits: readIncomingCommits(record['incomingCommits']),
    dirtyFiles: readStringArray(record, 'dirtyFiles'),
    credentialStatus: credentialStatusValues.has(credentialRaw as ProjectUpdateCredentialStatus)
      ? (credentialRaw as ProjectUpdateCredentialStatus)
      : 'unknown',
    appVersion: readString(record, 'appVersion'),
    logPath: readOptionalString(record, 'logPath'),
  };
}

export function mapCheckProjectUpdateResponse(value: MapperValue): CheckProjectUpdateResponse {
  const record = asRecord(value);
  if (!record) {
    return { ok: false, code: 'UNKNOWN', error: 'Malformed check response.' };
  }
  return {
    ok: readBoolean(record, 'ok'),
    preflight: mapProjectUpdatePreflight(record['preflight']) ?? undefined,
    code: readUpdateErrorCode(record['code']),
    error: readOptionalString(record, 'error'),
  };
}

export function mapStartProjectUpdateResponse(value: MapperValue): StartProjectUpdateResponse {
  const record = asRecord(value);
  if (!record) {
    return {
      ok: false,
      updateId: '',
      mode: 'packaged',
      status: 'failed',
      code: 'UNKNOWN',
      error: 'Malformed update response.',
    };
  }
  const statusRaw = readString(record, 'status', 'failed');
  return {
    ok: readBoolean(record, 'ok'),
    updateId: readString(record, 'updateId'),
    mode: readUpdateMode(record['mode']),
    status:
      statusRaw === 'started' || statusRaw === 'completed' || statusRaw === 'canceled'
        ? statusRaw
        : 'failed',
    code: readUpdateErrorCode(record['code']),
    error: readOptionalString(record, 'error'),
    requiresRestart: readBoolean(record, 'requiresRestart'),
    appliedCommit: readOptionalString(record, 'appliedCommit'),
    stashRef: readOptionalString(record, 'stashRef'),
    logPath: readOptionalString(record, 'logPath'),
  };
}

export function mapCancelProjectUpdateResponse(value: MapperValue): CancelProjectUpdateResponse {
  const record = asRecord(value);
  if (!record) {
    return { ok: false, error: 'Malformed cancel response.' };
  }
  return {
    ok: readBoolean(record, 'ok'),
    error: readOptionalString(record, 'error'),
  };
}

export function mapGetProjectUpdateLogResponse(value: MapperValue): GetProjectUpdateLogResponse {
  const record = asRecord(value);
  if (!record) {
    return { ok: false, error: 'Malformed log response.' };
  }
  return {
    ok: readBoolean(record, 'ok'),
    logPath: readOptionalString(record, 'logPath'),
    content: readOptionalString(record, 'content'),
    error: readOptionalString(record, 'error'),
  };
}

export function mapProjectUpdateProgressMessage(
  value: MapperValue,
): ProjectUpdateProgressMessage | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const phaseRaw = readString(record, 'phase', 'preflight');
  const statusRaw = readString(record, 'status', 'running');
  const toneRaw = readString(record, 'consoleTone', 'info');
  return {
    updateId: readString(record, 'updateId'),
    mode: readUpdateMode(record['mode']),
    phase: updatePhaseValues.has(phaseRaw as ProjectUpdateProgressMessage['phase'])
      ? (phaseRaw as ProjectUpdateProgressMessage['phase'])
      : 'preflight',
    status: updateStatusValues.has(statusRaw as ProjectUpdateProgressMessage['status'])
      ? (statusRaw as ProjectUpdateProgressMessage['status'])
      : 'running',
    stepIndex: readNumber(record, 'stepIndex') || undefined,
    stepTotal: readNumber(record, 'stepTotal') || undefined,
    stepLabel: readOptionalString(record, 'stepLabel'),
    consoleLine: readOptionalString(record, 'consoleLine'),
    consoleTone: updateToneValues.has(toneRaw as ProjectUpdateTone)
      ? (toneRaw as ProjectUpdateTone)
      : 'info',
    error: readOptionalString(record, 'error'),
  };
}
