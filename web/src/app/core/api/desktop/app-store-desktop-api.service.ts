import { Injectable, inject } from '@angular/core';
import type {
  PlayStoreAppDetailsRequest,
  PlayStoreAppDetailsResponse,
  PlayStoreDownloadRequest,
  PlayStoreDownloadResponse,
  PlayStoreDownloadsResponse,
  PlayStoreInstallRequest,
  PlayStoreInstallResponse,
  PlayStoreSearchRequest,
  PlayStoreSearchResponse,
  PlayStoreStatusResponse,
} from '../../models/desktop-api';
import {
  mapPlayStoreAppDetailsResponse,
  mapPlayStoreDownloadResponse,
  mapPlayStoreDownloadsResponse,
  mapPlayStoreInstallResponse,
  mapPlayStoreSearchResponse,
  mapPlayStoreStatusResponse,
} from '../desktop-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class AppStoreDesktopApiService {
  private readonly bridge = inject(DesktopBridgeClientService);

  async getPlayStoreStatus(): Promise<PlayStoreStatusResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getPlayStoreStatus(),
    );
    return mapPlayStoreStatusResponse(response);
  }

  async listPlayStoreDownloads(): Promise<PlayStoreDownloadsResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.listPlayStoreDownloads(),
    );
    return mapPlayStoreDownloadsResponse(response);
  }

  async searchPlayStoreApps(payload: PlayStoreSearchRequest): Promise<PlayStoreSearchResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.searchPlayStoreApps(payload),
    );
    return mapPlayStoreSearchResponse(response);
  }

  async getPlayStoreAppDetails(
    payload: PlayStoreAppDetailsRequest,
  ): Promise<PlayStoreAppDetailsResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getPlayStoreAppDetails(payload),
    );
    return mapPlayStoreAppDetailsResponse(response);
  }

  async downloadPlayStoreApp(
    payload: PlayStoreDownloadRequest,
  ): Promise<PlayStoreDownloadResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.downloadPlayStoreApp(payload),
    );
    return mapPlayStoreDownloadResponse(response);
  }

  async installPlayStoreApp(payload: PlayStoreInstallRequest): Promise<PlayStoreInstallResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.installPlayStoreApp(payload),
    );
    return mapPlayStoreInstallResponse(response);
  }
}
