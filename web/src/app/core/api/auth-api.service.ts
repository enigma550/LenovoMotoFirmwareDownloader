import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ensureDesktopBridgeReady,
  getDesktopBridgeError,
  reconnectDesktopBridge,
} from '../bridge/electrobun-bridge';
import type {
  AppInfo,
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  AuthCompleteResponse,
  AuthStartResponse,
  BridgePingResponse,
  CancelDownloadRequest,
  CancelDownloadResponse,
  CatalogModelsResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  DeleteLocalFileRequest,
  DesktopIntegrationStatus,
  DownloadFirmwareRequest,
  DownloadFirmwareResponse,
  ExtractLocalFirmwareRequest,
  ExtractLocalFirmwareResponse,
  FrameworkUpdateInfo,
  GetCatalogModelsRequest,
  LocalDownloadedFilesResponse,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  PauseDownloadRequest,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
  RescueLiteFirmwareResponse,
  ResumeDownloadRequest,
  StoredAuthStateResponse,
  WindowsEdlDriverInstallResponse,
} from '../models/desktop-api.ts';
import {
  mapAppInfo,
  mapAttachLocalRecipeResponse,
  mapAuthCompleteResponse,
  mapAuthStartResponse,
  mapBooleanResponse,
  mapBridgePingResponse,
  mapCancelDownloadResponse,
  mapCatalogModelsResponse,
  mapConnectedLookupResponse,
  mapCountryOptionsResponse,
  mapDesktopIntegrationStatus,
  mapDownloadFirmwareResponse,
  mapExtractLocalFirmwareResponse,
  mapFrameworkUpdateInfo,
  mapLocalDownloadedFilesResponse,
  mapManualCatalogLookupResponse,
  mapReadSupportHintsResponse,
  mapReadSupportLookupResponse,
  mapRescueLiteFirmwareResponse,
  mapSimpleOkResponse,
  mapStoredAuthStateResponse,
  mapWindowsEdlDriverInstallResponse,
} from './desktop-response.mapper';

type BridgeFailureResponse = {
  ok: boolean;
  error?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly isViewsProtocol = window.location.protocol === 'views:';

  async startBrowserAuth(): Promise<AuthStartResponse> {
    const response = await this.runAuthAction(
      (desktopApi) => desktopApi.startAuth(),
      () => firstValueFrom(this.httpClient.post<AuthStartResponse>('/api/auth/start', {})),
    );

    return mapAuthStartResponse(response);
  }

  async completeAuth(
    callbackUrlOrToken: AuthCompleteRequest['callbackUrlOrToken'],
  ): Promise<AuthCompleteResponse> {
    const response = await this.runAuthAction(
      (desktopApi) => desktopApi.completeAuth(callbackUrlOrToken),
      () =>
        firstValueFrom(
          this.httpClient.post<AuthCompleteResponse>('/api/auth/complete', {
            callbackUrlOrToken,
          }),
        ),
    );

    return mapAuthCompleteResponse(response);
  }

  async getStoredAuthState(): Promise<StoredAuthStateResponse> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.getStoredAuthState());
    return mapStoredAuthStateResponse(response);
  }

  async authenticateWithStoredToken(): Promise<AuthCompleteResponse> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.authWithStoredToken());
    return mapAuthCompleteResponse(response);
  }

  async ping(): Promise<BridgePingResponse> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.ping());
    return mapBridgePingResponse(response);
  }

  async getCatalogModels(
    refresh: GetCatalogModelsRequest['refresh'] = false,
  ): Promise<CatalogModelsResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.getCatalogModels(refresh),
    );
    return mapCatalogModelsResponse(response);
  }

  async lookupConnectedDeviceFirmware(): Promise<ConnectedLookupResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.lookupConnectedDeviceFirmware(),
    );
    return mapConnectedLookupResponse(response);
  }

  async discoverCountryOptions(model: ModelCatalogEntry): Promise<CountryOptionsResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.discoverCountryOptions(model),
    );
    return mapCountryOptionsResponse(response);
  }

  async lookupCatalogManual(
    model: ModelCatalogEntry,
    countryValue?: string,
    allCountries = false,
  ): Promise<ManualCatalogLookupResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.lookupCatalogManual(model, countryValue, allCountries),
    );
    return mapManualCatalogLookupResponse(response);
  }

  async getReadSupportHints(modelName: string): Promise<ReadSupportHintsResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.getReadSupportHints(modelName),
    );
    return mapReadSupportHintsResponse(response);
  }

  async lookupReadSupportByImei(
    payload: LookupReadSupportByImeiRequest,
  ): Promise<ReadSupportLookupResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.lookupReadSupportByImei(payload),
    );
    return mapReadSupportLookupResponse(response);
  }

  async lookupReadSupportBySn(
    payload: LookupReadSupportBySnRequest,
  ): Promise<ReadSupportLookupResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.lookupReadSupportBySn(payload),
    );
    return mapReadSupportLookupResponse(response);
  }

  async lookupReadSupportByParams(
    payload: LookupReadSupportByParamsRequest,
  ): Promise<ReadSupportLookupResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.lookupReadSupportByParams(payload),
    );
    return mapReadSupportLookupResponse(response);
  }

  async downloadFirmware(payload: DownloadFirmwareRequest): Promise<DownloadFirmwareResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.downloadFirmware(payload),
    );
    return mapDownloadFirmwareResponse(response);
  }

  async rescueLiteFirmware(
    payload: RescueLiteFirmwareRequest,
  ): Promise<RescueLiteFirmwareResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.rescueLiteFirmware(payload),
    );
    return mapRescueLiteFirmwareResponse(response);
  }

  async rescueLiteFirmwareFromLocal(
    payload: RescueLiteFirmwareFromLocalRequest,
  ): Promise<RescueLiteFirmwareResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.rescueLiteFirmwareFromLocal(payload),
    );
    return mapRescueLiteFirmwareResponse(response);
  }

  async listLocalDownloadedFiles(): Promise<LocalDownloadedFilesResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.listLocalDownloadedFiles(),
    );
    return mapLocalDownloadedFilesResponse(response);
  }

  async extractLocalFirmware(
    payload: ExtractLocalFirmwareRequest,
  ): Promise<ExtractLocalFirmwareResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.extractLocalFirmware(payload),
    );
    return mapExtractLocalFirmwareResponse(response);
  }

  async attachLocalRecipeFromModel(
    payload: AttachLocalRecipeFromModelRequest,
  ): Promise<AttachLocalRecipeResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.attachLocalRecipeFromModel(payload),
    );
    return mapAttachLocalRecipeResponse(response);
  }

  async attachLocalRecipeMetadata(
    payload: AttachLocalRecipeMetadataRequest,
  ): Promise<AttachLocalRecipeResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.attachLocalRecipeMetadata(payload),
    );
    return mapAttachLocalRecipeResponse(response);
  }

  reconnectDesktopBridge() {
    return reconnectDesktopBridge();
  }

  async cancelDownload(payload: CancelDownloadRequest): Promise<CancelDownloadResponse> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.cancelDownload(payload));
    return mapCancelDownloadResponse(response);
  }

  async deleteLocalFile(payload: DeleteLocalFileRequest): Promise<{ ok: boolean; error?: string }> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.deleteLocalFile(payload));
    return mapSimpleOkResponse(response);
  }

  async pauseDownload(payload: PauseDownloadRequest): Promise<{ ok: boolean; error?: string }> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.pauseDownload(payload));
    return mapSimpleOkResponse(response);
  }

  async resumeDownload(payload: ResumeDownloadRequest): Promise<DownloadFirmwareResponse> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.resumeDownload(payload));
    return mapDownloadFirmwareResponse(response);
  }

  async checkDesktopIntegration(): Promise<DesktopIntegrationStatus> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.checkDesktopIntegration(),
    );
    return mapDesktopIntegrationStatus(response);
  }

  async createDesktopIntegration(): Promise<DesktopIntegrationStatus> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.createDesktopIntegration(),
    );
    return mapDesktopIntegrationStatus(response);
  }

  async getDesktopPromptPreference(): Promise<boolean> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.getDesktopPromptPreference(),
    );
    return mapBooleanResponse(response, false);
  }

  async setDesktopPromptPreference(ask: boolean): Promise<boolean> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.setDesktopPromptPreference({ ask }),
    );
    return mapBooleanResponse(response, false);
  }

  async getAppInfo(): Promise<AppInfo> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.getAppInfo());
    return mapAppInfo(response);
  }

  async openUrl(url: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.openUrl(url));
    return mapSimpleOkResponse(response);
  }

  async checkFrameworkUpdate(): Promise<FrameworkUpdateInfo> {
    const response = await this.withDesktopApi((desktopApi) => desktopApi.checkFrameworkUpdate());
    return mapFrameworkUpdateInfo(response);
  }

  async downloadFrameworkUpdate(): Promise<void> {
    await this.withDesktopApi((desktopApi) => desktopApi.downloadFrameworkUpdate());
  }

  async applyFrameworkUpdate(): Promise<void> {
    await this.withDesktopApi((desktopApi) => desktopApi.applyFrameworkUpdate());
  }

  async installWindowsEdlDriver(): Promise<WindowsEdlDriverInstallResponse> {
    const response = await this.withDesktopApi((desktopApi) =>
      desktopApi.installWindowsEdlDriver(),
    );
    return mapWindowsEdlDriverInstallResponse(response);
  }

  private async getDesktopApi() {
    if (this.isViewsProtocol) {
      await ensureDesktopBridgeReady();
    }

    const desktopApi = window.desktopApi;
    if (desktopApi?.isDesktop) {
      return desktopApi;
    }

    if (this.isViewsProtocol) {
      const bridgeError = getDesktopBridgeError();
      throw new Error(
        bridgeError
          ? `Desktop bridge failed: ${bridgeError}`
          : 'Desktop bridge was not initialized. Restart the app.',
      );
    }

    throw new Error('This action requires desktop mode. Run `bun run start`.');
  }

  private async withDesktopApi<T>(
    action: (desktopApi: NonNullable<typeof window.desktopApi>) => Promise<T>,
  ): Promise<T> {
    const desktopApi = await this.getDesktopApi();
    return action(desktopApi);
  }

  private async runAuthAction<T extends BridgeFailureResponse>(
    desktopAction: (desktopApi: NonNullable<typeof window.desktopApi>) => Promise<T>,
    webAction: () => Promise<T>,
  ): Promise<T> {
    if (this.isViewsProtocol) {
      await ensureDesktopBridgeReady();
    }

    const desktopApi = window.desktopApi;
    if (desktopApi?.isDesktop) {
      return desktopAction(desktopApi);
    }

    if (this.isViewsProtocol) {
      const bridgeError = getDesktopBridgeError();
      return {
        ok: false,
        error: bridgeError
          ? `Desktop bridge failed: ${bridgeError}`
          : 'Desktop bridge was not initialized. Restart the app.',
      } as T;
    }

    return webAction();
  }
}
