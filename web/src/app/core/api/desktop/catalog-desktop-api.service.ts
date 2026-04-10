import { Injectable, inject } from '@angular/core';
import type {
  CatalogModelsResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  GetCatalogModelsRequest,
  LookupConnectedDeviceFirmwareFromDeviceInfoRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
} from '../../models/desktop-api';
import {
  mapCatalogModelsResponse,
  mapConnectedLookupResponse,
  mapCountryOptionsResponse,
  mapManualCatalogLookupResponse,
  mapReadSupportHintsResponse,
  mapReadSupportLookupResponse,
} from '../desktop-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class CatalogDesktopApiService {
  private readonly bridge = inject(DesktopBridgeClientService);

  async getCatalogModels(
    refresh: GetCatalogModelsRequest['refresh'] = false,
  ): Promise<CatalogModelsResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getCatalogModels(refresh),
    );
    return mapCatalogModelsResponse(response);
  }

  async lookupConnectedDeviceFirmware(): Promise<ConnectedLookupResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.lookupConnectedDeviceFirmware(),
    );
    return mapConnectedLookupResponse(response);
  }

  async lookupConnectedDeviceFirmwareFromDeviceInfo(
    payload: LookupConnectedDeviceFirmwareFromDeviceInfoRequest,
  ): Promise<ConnectedLookupResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.lookupConnectedDeviceFirmwareFromDeviceInfo(payload),
    );
    return mapConnectedLookupResponse(response);
  }

  async discoverCountryOptions(model: ModelCatalogEntry): Promise<CountryOptionsResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.discoverCountryOptions(model),
    );
    return mapCountryOptionsResponse(response);
  }

  async lookupCatalogManual(
    model: ModelCatalogEntry,
    countryValue?: string,
    allCountries = false,
  ): Promise<ManualCatalogLookupResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.lookupCatalogManual(model, countryValue, allCountries),
    );
    return mapManualCatalogLookupResponse(response);
  }

  async getReadSupportHints(modelName: string): Promise<ReadSupportHintsResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getReadSupportHints(modelName),
    );
    return mapReadSupportHintsResponse(response);
  }

  async lookupReadSupportByImei(
    payload: LookupReadSupportByImeiRequest,
  ): Promise<ReadSupportLookupResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.lookupReadSupportByImei(payload),
    );
    return mapReadSupportLookupResponse(response);
  }

  async lookupReadSupportBySn(
    payload: LookupReadSupportBySnRequest,
  ): Promise<ReadSupportLookupResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.lookupReadSupportBySn(payload),
    );
    return mapReadSupportLookupResponse(response);
  }

  async lookupReadSupportByParams(
    payload: LookupReadSupportByParamsRequest,
  ): Promise<ReadSupportLookupResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.lookupReadSupportByParams(payload),
    );
    return mapReadSupportLookupResponse(response);
  }
}
