/**
 * Response mappers for Backup & Restore domain.
 * Maps raw RPC payloads into typed backup/restore response interfaces.
 */
import type {
  BackupConnectedDeviceResponse,
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
  BackupRestoreSnapshot,
  BackupRestoreSnapshotsResponse,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
  DeleteBackupSnapshotResponse,
  LocalDownloadedFile,
  LocalDownloadedFilesResponse,
  RestoreBackupSnapshotResponse,
} from '../models/desktop-api';
import {
  asRecord,
  type MapperValue,
  mapSimpleOkResponse,
  readBoolean,
  readNumber,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readString,
  readStringArray,
  readStringMap,
} from './mapper-utils';

function mapBackupRestoreAppEntry(value: MapperValue): BackupRestoreAppEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record, 'id'),
    appName: readString(record, 'appName'),
    packageName: readOptionalString(record, 'packageName'),
    iconDataUrl: readOptionalString(record, 'iconDataUrl'),
    apkRelativePath: readOptionalString(record, 'apkRelativePath'),
    itemCount: readOptionalNumber(record, 'itemCount'),
    sizeBytes: readOptionalNumber(record, 'sizeBytes'),
  };
}

function mapBackupRestoreMediaEntry(value: MapperValue): BackupRestoreMediaEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const mediaTypeValue = record['mediaType'];
  const mediaType: BackupRestoreMediaEntry['mediaType'] =
    mediaTypeValue === 'image' ||
    mediaTypeValue === 'video' ||
    mediaTypeValue === 'audio' ||
    mediaTypeValue === 'document'
      ? mediaTypeValue
      : 'other';

  return {
    id: readString(record, 'id'),
    fileName: readString(record, 'fileName'),
    relativePath: readString(record, 'relativePath'),
    mediaType,
    thumbnailDataUrl: readOptionalString(record, 'thumbnailDataUrl'),
    sizeBytes: readOptionalNumber(record, 'sizeBytes'),
    modifiedAt: readOptionalNumber(record, 'modifiedAt'),
  };
}

function mapBackupRestoreMessageEntry(value: MapperValue): BackupRestoreMessageEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record, 'id'),
    sender: readString(record, 'sender'),
    preview: readString(record, 'preview'),
    thread: readOptionalString(record, 'thread'),
    timestamp: readOptionalNumber(record, 'timestamp'),
    messageType: readOptionalString(record, 'messageType') as
      | 'sent'
      | 'received'
      | 'unknown'
      | undefined,
  };
}

function mapBackupRestoreContactEntry(value: MapperValue): BackupRestoreContactEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record, 'id'),
    displayName: readString(record, 'displayName'),
    phoneNumber: readOptionalString(record, 'phoneNumber'),
    email: readOptionalString(record, 'email'),
  };
}

function mapBackupRestoreFileEntry(value: MapperValue): BackupRestoreFileEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record, 'id'),
    fileName: readString(record, 'fileName'),
    relativePath: readString(record, 'relativePath'),
    fileType: readString(record, 'fileType') === 'directory' ? 'directory' : 'file',
    sizeBytes: readOptionalNumber(record, 'sizeBytes'),
    modifiedAt: readOptionalNumber(record, 'modifiedAt'),
  };
}

function mapBackupRestoreSnapshot(value: MapperValue): BackupRestoreSnapshot | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record, 'id'),
    title: readString(record, 'title'),
    sourcePath: readString(record, 'sourcePath'),
    relativeSourcePath: readOptionalString(record, 'relativeSourcePath'),
    createdAt: readNumber(record, 'createdAt', 0),
    sizeBytes: readOptionalNumber(record, 'sizeBytes'),
    deviceName: readOptionalString(record, 'deviceName'),
    androidVersion: readOptionalString(record, 'androidVersion'),
    categories: readStringArray(record, 'categories'),
    apps: Array.isArray(record['apps'])
      ? record['apps']
          .map((item) => mapBackupRestoreAppEntry(item))
          .filter((item): item is BackupRestoreAppEntry => item !== null)
      : [],
    media: Array.isArray(record['media'])
      ? record['media']
          .map((item) => mapBackupRestoreMediaEntry(item))
          .filter((item): item is BackupRestoreMediaEntry => item !== null)
      : [],
    contacts: Array.isArray(record['contacts'])
      ? record['contacts']
          .map((item) => mapBackupRestoreContactEntry(item))
          .filter((item): item is BackupRestoreContactEntry => item !== null)
      : [],
    messages: Array.isArray(record['messages'])
      ? record['messages']
          .map((item) => mapBackupRestoreMessageEntry(item))
          .filter((item): item is BackupRestoreMessageEntry => item !== null)
      : [],
    files: Array.isArray(record['files'])
      ? record['files']
          .map((item) => mapBackupRestoreFileEntry(item))
          .filter((item): item is BackupRestoreFileEntry => item !== null)
      : [],
  };
}

function mapLocalDownloadedFile(value: MapperValue): LocalDownloadedFile | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    fileName: readString(record, 'fileName'),
    fullPath: readString(record, 'fullPath'),
    relativePath: readOptionalString(record, 'relativePath'),
    sizeBytes: readNumber(record, 'sizeBytes', 0),
    modifiedAt: readNumber(record, 'modifiedAt', 0),
    publishDate: readOptionalString(record, 'publishDate'),
    extractedDir: readString(record, 'extractedDir'),
    relativeExtractedDir: readOptionalString(record, 'relativeExtractedDir'),
    hasExtractedDir: readBoolean(record, 'hasExtractedDir', false),
    recipeUrl: readOptionalString(record, 'recipeUrl'),
    romMatchIdentifier: readOptionalString(record, 'romMatchIdentifier'),
    selectedParameters: readStringMap(record['selectedParameters']),
    metadataSource: readOptionalString(record, 'metadataSource'),
    hasRecipeMetadata: readOptionalBoolean(record, 'hasRecipeMetadata'),
  };
}

export function mapLocalDownloadedFilesResponse(
  payload: MapperValue,
): LocalDownloadedFilesResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    files: Array.isArray(record?.['files'])
      ? record['files']
          .map((item) => mapLocalDownloadedFile(item))
          .filter((item): item is LocalDownloadedFile => item !== null)
      : [],
  };
}

export function mapBackupRestoreSnapshotsResponse(
  payload: MapperValue,
): BackupRestoreSnapshotsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    rootPath: record ? readString(record, 'rootPath') : '',
    relativeRootPath: record ? readOptionalString(record, 'relativeRootPath') : undefined,
    snapshots: Array.isArray(record?.['snapshots'])
      ? record['snapshots']
          .map((item) => mapBackupRestoreSnapshot(item))
          .filter((item): item is BackupRestoreSnapshot => item !== null)
      : [],
  };
}

export function mapDeleteBackupSnapshotResponse(
  payload: MapperValue,
): DeleteBackupSnapshotResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    snapshotId: record ? readString(record, 'snapshotId') : '',
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapConnectedBackupPreviewResponse(
  payload: MapperValue,
): ConnectedBackupPreviewResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    connected: record ? readBoolean(record, 'connected', false) : false,
    detail: record ? readOptionalString(record, 'detail') : undefined,
    snapshot: record ? mapBackupRestoreSnapshot(record['snapshot']) || undefined : undefined,
  };
}

export function mapConnectedBackupPreviewProgressResponse(
  payload: MapperValue,
): ConnectedBackupPreviewProgressResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    running: record ? readBoolean(record, 'running', false) : false,
    runId: record ? readNumber(record, 'runId', 0) : 0,
    totalApps: record ? readNumber(record, 'totalApps', 0) : 0,
    completedApps: record ? readNumber(record, 'completedApps', 0) : 0,
    iconsFound: record ? readNumber(record, 'iconsFound', 0) : 0,
    failedIcons: record ? readNumber(record, 'failedIcons', 0) : 0,
    logBaseCount: record ? readNumber(record, 'logBaseCount', 0) : 0,
    logCount: record ? readNumber(record, 'logCount', 0) : 0,
    logs: record ? readStringArray(record, 'logs') : [],
    lastLogLine: record ? readOptionalString(record, 'lastLogLine') : undefined,
    detail: record ? readOptionalString(record, 'detail') : undefined,
    currentPackage: record ? readOptionalString(record, 'currentPackage') : undefined,
    previewDeviceName: record ? readOptionalString(record, 'previewDeviceName') : undefined,
    previewAndroidVersion: record ? readOptionalString(record, 'previewAndroidVersion') : undefined,
    apps: Array.isArray(record?.['apps'])
      ? record['apps']
          .map((item) => mapBackupRestoreAppEntry(item))
          .filter((item): item is BackupRestoreAppEntry => item !== null)
      : [],
    media: Array.isArray(record?.['media'])
      ? record['media']
          .map((item) => mapBackupRestoreMediaEntry(item))
          .filter((item): item is BackupRestoreMediaEntry => item !== null)
      : [],
    contacts: Array.isArray(record?.['contacts'])
      ? record['contacts']
          .map((item) => mapBackupRestoreContactEntry(item))
          .filter((item): item is BackupRestoreContactEntry => item !== null)
      : [],
    messages: Array.isArray(record?.['messages'])
      ? record['messages']
          .map((item) => mapBackupRestoreMessageEntry(item))
          .filter((item): item is BackupRestoreMessageEntry => item !== null)
      : [],
    files: Array.isArray(record?.['files'])
      ? record['files']
          .map((item) => mapBackupRestoreFileEntry(item))
          .filter((item): item is BackupRestoreFileEntry => item !== null)
      : [],
  };
}

export function mapBackupConnectedDeviceResponse(
  payload: MapperValue,
): BackupConnectedDeviceResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    connected: record ? readBoolean(record, 'connected', false) : false,
    snapshotId: record ? readOptionalString(record, 'snapshotId') : undefined,
    snapshotPath: record ? readOptionalString(record, 'snapshotPath') : undefined,
    relativeSnapshotPath: record ? readOptionalString(record, 'relativeSnapshotPath') : undefined,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapRestoreBackupSnapshotResponse(
  payload: MapperValue,
): RestoreBackupSnapshotResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    connected: record ? readBoolean(record, 'connected', false) : false,
    snapshotId: record ? readString(record, 'snapshotId') : '',
    attemptedApps: record ? readNumber(record, 'attemptedApps', 0) : 0,
    restoredApps: record ? readNumber(record, 'restoredApps', 0) : 0,
    failedApps: record ? readNumber(record, 'failedApps', 0) : 0,
    attemptedMedia: record ? readNumber(record, 'attemptedMedia', 0) : 0,
    restoredMedia: record ? readNumber(record, 'restoredMedia', 0) : 0,
    failedMedia: record ? readNumber(record, 'failedMedia', 0) : 0,
    attemptedContacts: record ? readNumber(record, 'attemptedContacts', 0) : 0,
    restoredContacts: record ? readNumber(record, 'restoredContacts', 0) : 0,
    failedContacts: record ? readNumber(record, 'failedContacts', 0) : 0,
    attemptedMessages: record ? readNumber(record, 'attemptedMessages', 0) : 0,
    restoredMessages: record ? readNumber(record, 'restoredMessages', 0) : 0,
    failedMessages: record ? readNumber(record, 'failedMessages', 0) : 0,
    attemptedFiles: record ? readNumber(record, 'attemptedFiles', 0) : 0,
    restoredFiles: record ? readNumber(record, 'restoredFiles', 0) : 0,
    failedFiles: record ? readNumber(record, 'failedFiles', 0) : 0,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}
