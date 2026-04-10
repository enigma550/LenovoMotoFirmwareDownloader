import { Injectable, inject } from '@angular/core';
import type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  CancelDownloadRequest,
  CancelDownloadResponse,
  DeleteLocalFileRequest,
  DownloadFirmwareRequest,
  DownloadFirmwareResponse,
  ExtractLocalFirmwareRequest,
  ExtractLocalFirmwareResponse,
  LocalDownloadedFilesResponse,
  PauseDownloadRequest,
  ReadLocalFileContentRequest,
  ReadLocalFileContentResponse,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
  RescueLiteFirmwareResponse,
  ResumeDownloadRequest,
} from '../../models/desktop-api';
import {
  mapAttachLocalRecipeResponse,
  mapCancelDownloadResponse,
  mapDownloadFirmwareResponse,
  mapExtractLocalFirmwareResponse,
  mapLocalDownloadedFilesResponse,
  mapReadLocalFileContentResponse,
  mapRescueLiteFirmwareResponse,
  mapSimpleOkResponse,
} from '../desktop-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class DownloadsDesktopApiService {
  private readonly bridge = inject(DesktopBridgeClientService);

  async downloadFirmware(payload: DownloadFirmwareRequest): Promise<DownloadFirmwareResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.downloadFirmware(payload),
    );
    return mapDownloadFirmwareResponse(response);
  }

  async rescueLiteFirmware(
    payload: RescueLiteFirmwareRequest,
  ): Promise<RescueLiteFirmwareResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.rescueLiteFirmware(payload),
    );
    return mapRescueLiteFirmwareResponse(response);
  }

  async rescueLiteFirmwareFromLocal(
    payload: RescueLiteFirmwareFromLocalRequest,
  ): Promise<RescueLiteFirmwareResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.rescueLiteFirmwareFromLocal(payload),
    );
    return mapRescueLiteFirmwareResponse(response);
  }

  async listLocalDownloadedFiles(): Promise<LocalDownloadedFilesResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.listLocalDownloadedFiles(),
    );
    return mapLocalDownloadedFilesResponse(response);
  }

  async extractLocalFirmware(
    payload: ExtractLocalFirmwareRequest,
  ): Promise<ExtractLocalFirmwareResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.extractLocalFirmware(payload),
    );
    return mapExtractLocalFirmwareResponse(response);
  }

  async readLocalFileContent(
    payload: ReadLocalFileContentRequest,
  ): Promise<ReadLocalFileContentResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.readLocalFileContent(payload),
    );
    return mapReadLocalFileContentResponse(response);
  }

  async attachLocalRecipeFromModel(
    payload: AttachLocalRecipeFromModelRequest,
  ): Promise<AttachLocalRecipeResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.attachLocalRecipeFromModel(payload),
    );
    return mapAttachLocalRecipeResponse(response);
  }

  async attachLocalRecipeMetadata(
    payload: AttachLocalRecipeMetadataRequest,
  ): Promise<AttachLocalRecipeResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.attachLocalRecipeMetadata(payload),
    );
    return mapAttachLocalRecipeResponse(response);
  }

  async cancelDownload(payload: CancelDownloadRequest): Promise<CancelDownloadResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.cancelDownload(payload),
    );
    return mapCancelDownloadResponse(response);
  }

  async deleteLocalFile(payload: DeleteLocalFileRequest): Promise<{ ok: boolean; error?: string }> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.deleteLocalFile(payload),
    );
    return mapSimpleOkResponse(response);
  }

  async pauseDownload(payload: PauseDownloadRequest): Promise<{ ok: boolean; error?: string }> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.pauseDownload(payload),
    );
    return mapSimpleOkResponse(response);
  }

  async resumeDownload(payload: ResumeDownloadRequest): Promise<DownloadFirmwareResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.resumeDownload(payload),
    );
    return mapDownloadFirmwareResponse(response);
  }
}
