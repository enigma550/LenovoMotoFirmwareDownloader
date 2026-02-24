import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ensureDesktopBridgeReady,
  getDesktopBridgeError,
  reconnectDesktopBridge,
} from '../bridge/electrobun-bridge';
import type {
  AttachLocalRecipeResponse,
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AuthCompleteRequest,
  AuthCompleteResponse,
  AuthStartResponse,
  CancelDownloadRequest,
  CancelDownloadResponse,
  DeleteLocalFileRequest,
  PauseDownloadRequest,
  ResumeDownloadRequest,
  CatalogModelsResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  DownloadFirmwareRequest,
  DownloadFirmwareResponse,
  ExtractLocalFirmwareRequest,
  ExtractLocalFirmwareResponse,
  GetCatalogModelsRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  RescueLiteFirmwareResponse,
  RescueLiteFirmwareRequest,
  RescueLiteFirmwareFromLocalRequest,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
  StoredAuthStateResponse,
} from '../models/desktop-api.ts';

type BridgeFailureResponse = {
  ok: boolean;
  error?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly isViewsProtocol = window.location.protocol === 'views:';

  async startBrowserAuth(): Promise<AuthStartResponse> {
    return this.runAuthAction(
      (desktopApi) => desktopApi.startAuth(),
      () => firstValueFrom(this.httpClient.post<AuthStartResponse>('/api/auth/start', {})),
    );
  }

  async completeAuth(
    callbackUrlOrToken: AuthCompleteRequest['callbackUrlOrToken'],
  ): Promise<AuthCompleteResponse> {
    return this.runAuthAction(
      (desktopApi) => desktopApi.completeAuth(callbackUrlOrToken),
      () =>
        firstValueFrom(
          this.httpClient.post<AuthCompleteResponse>('/api/auth/complete', {
            callbackUrlOrToken,
          }),
        ),
    );
  }

  getStoredAuthState(): Promise<StoredAuthStateResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.getStoredAuthState());
  }

  authenticateWithStoredToken(): Promise<AuthCompleteResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.authWithStoredToken());
  }

  ping() {
    return this.withDesktopApi((desktopApi) => desktopApi.ping());
  }

  getCatalogModels(
    refresh: GetCatalogModelsRequest['refresh'] = false,
  ): Promise<CatalogModelsResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.getCatalogModels(refresh));
  }

  lookupConnectedDeviceFirmware(): Promise<ConnectedLookupResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.lookupConnectedDeviceFirmware());
  }

  discoverCountryOptions(model: ModelCatalogEntry): Promise<CountryOptionsResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.discoverCountryOptions(model));
  }

  lookupCatalogManual(
    model: ModelCatalogEntry,
    countryValue?: string,
    allCountries = false,
  ): Promise<ManualCatalogLookupResponse> {
    return this.withDesktopApi((desktopApi) =>
      desktopApi.lookupCatalogManual(model, countryValue, allCountries),
    );
  }

  getReadSupportHints(modelName: string): Promise<ReadSupportHintsResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.getReadSupportHints(modelName));
  }

  lookupReadSupportByImei(
    payload: LookupReadSupportByImeiRequest,
  ): Promise<ReadSupportLookupResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.lookupReadSupportByImei(payload));
  }

  lookupReadSupportBySn(payload: LookupReadSupportBySnRequest): Promise<ReadSupportLookupResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.lookupReadSupportBySn(payload));
  }

  lookupReadSupportByParams(
    payload: LookupReadSupportByParamsRequest,
  ): Promise<ReadSupportLookupResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.lookupReadSupportByParams(payload));
  }

  downloadFirmware(payload: DownloadFirmwareRequest): Promise<DownloadFirmwareResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.downloadFirmware(payload));
  }

  rescueLiteFirmware(payload: RescueLiteFirmwareRequest): Promise<RescueLiteFirmwareResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.rescueLiteFirmware(payload));
  }

  rescueLiteFirmwareFromLocal(
    payload: RescueLiteFirmwareFromLocalRequest,
  ): Promise<RescueLiteFirmwareResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.rescueLiteFirmwareFromLocal(payload));
  }

  listLocalDownloadedFiles() {
    return this.withDesktopApi((desktopApi) => desktopApi.listLocalDownloadedFiles());
  }

  extractLocalFirmware(
    payload: ExtractLocalFirmwareRequest,
  ): Promise<ExtractLocalFirmwareResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.extractLocalFirmware(payload));
  }

  attachLocalRecipeFromModel(
    payload: AttachLocalRecipeFromModelRequest,
  ): Promise<AttachLocalRecipeResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.attachLocalRecipeFromModel(payload));
  }

  attachLocalRecipeMetadata(
    payload: AttachLocalRecipeMetadataRequest,
  ): Promise<AttachLocalRecipeResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.attachLocalRecipeMetadata(payload));
  }

  reconnectDesktopBridge() {
    return reconnectDesktopBridge();
  }

  cancelDownload(payload: CancelDownloadRequest): Promise<CancelDownloadResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.cancelDownload(payload));
  }

  deleteLocalFile(payload: DeleteLocalFileRequest): Promise<{ ok: boolean; error?: string }> {
    return this.withDesktopApi((desktopApi) => desktopApi.deleteLocalFile(payload));
  }

  pauseDownload(payload: PauseDownloadRequest): Promise<{ ok: boolean; error?: string }> {
    return this.withDesktopApi((desktopApi) => desktopApi.pauseDownload(payload));
  }

  resumeDownload(payload: ResumeDownloadRequest): Promise<DownloadFirmwareResponse> {
    return this.withDesktopApi((desktopApi) => desktopApi.resumeDownload(payload));
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
