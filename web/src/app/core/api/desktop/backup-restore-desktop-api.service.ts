import { Injectable, inject } from '@angular/core';
import type {
  BackupConnectedDeviceRequest,
  BackupConnectedDeviceResponse,
  BackupRestoreSnapshotsResponse,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
  DeleteBackupSnapshotRequest,
  DeleteBackupSnapshotResponse,
  RestoreBackupSnapshotRequest,
  RestoreBackupSnapshotResponse,
} from '../../models/desktop-api';
import {
  mapBackupConnectedDeviceResponse,
  mapBackupRestoreSnapshotsResponse,
  mapConnectedBackupPreviewProgressResponse,
  mapConnectedBackupPreviewResponse,
  mapDeleteBackupSnapshotResponse,
  mapRestoreBackupSnapshotResponse,
} from '../desktop-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class BackupRestoreDesktopApiService {
  private readonly bridge = inject(DesktopBridgeClientService);

  async listBackupRestoreSnapshots(): Promise<BackupRestoreSnapshotsResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.listBackupRestoreSnapshots(),
    );
    return mapBackupRestoreSnapshotsResponse(response);
  }

  async deleteBackupSnapshot(
    payload: DeleteBackupSnapshotRequest,
  ): Promise<DeleteBackupSnapshotResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.deleteBackupSnapshot(payload),
    );
    return mapDeleteBackupSnapshotResponse(response);
  }

  async scanConnectedBackupPreview(): Promise<ConnectedBackupPreviewResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.scanConnectedBackupPreview(),
    );
    return mapConnectedBackupPreviewResponse(response);
  }

  async getConnectedBackupPreviewProgress(): Promise<ConnectedBackupPreviewProgressResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getConnectedBackupPreviewProgress(),
    );
    return mapConnectedBackupPreviewProgressResponse(response);
  }

  async cancelConnectedBackupProcess(): Promise<{ ok: boolean; detail: string }> {
    return this.bridge.withDesktopApi((desktopApi) => desktopApi.cancelConnectedBackupProcess());
  }

  async backupConnectedDevice(
    payload: BackupConnectedDeviceRequest = {},
  ): Promise<BackupConnectedDeviceResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.backupConnectedDevice(payload),
    );
    return mapBackupConnectedDeviceResponse(response);
  }

  async restoreBackupSnapshot(
    payload: RestoreBackupSnapshotRequest,
  ): Promise<RestoreBackupSnapshotResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.restoreBackupSnapshot(payload),
    );
    return mapRestoreBackupSnapshotResponse(response);
  }
}
