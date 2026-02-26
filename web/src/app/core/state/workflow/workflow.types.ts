import type {
  FirmwareTaskStatus,
  RescueFlashTransport,
  RescueQdlStorage,
} from '../../models/desktop-api.ts';

export type CategoryFilter = 'all' | 'phone' | 'tablet' | 'smart';
export type ReadSupportFilter = 'all' | 'true' | 'false';
export type SourceMode = 'connected' | 'catalog' | 'downloads' | 'about' | null;
export type ReadSupportMode = 'imei' | 'sn' | 'params';
export type ThemeMode = 'light' | 'dark';
export type ToastVariant = 'info' | 'success' | 'error';
export type DownloadStatus = 'idle' | 'canceling' | FirmwareTaskStatus;
export type DownloadMode = 'download' | 'rescue-lite';
export type DataResetChoice = 'yes' | 'no';

export interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface FirmwareDownloadState {
  downloadId: string;
  romUrl: string;
  romName: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  status: DownloadStatus;
  mode: DownloadMode;
  dryRun: boolean;
  dataReset: DataResetChoice;
  flashTransport: RescueFlashTransport;
  qdlStorage: RescueQdlStorage;
  qdlSerial: string;
  savePath: string;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSecond: number;
  phase?: 'download' | 'prepare' | 'flash';
  stepIndex?: number | null;
  stepTotal?: number | null;
  stepLabel?: string;
  commandSource?: string;
  error: string;
}

export interface DownloadHistoryEntry extends FirmwareDownloadState {
  startedAt: number;
  updatedAt: number;
}

export interface RescueDryRunPlanDialog {
  downloadId: string;
  romName: string;
  commandSource: string;
  commands: string[];
  dataReset: DataResetChoice;
  flashTransport: RescueFlashTransport;
  qdlStorage: RescueQdlStorage;
  qdlSerial: string;
  localFilePath?: string;
}
