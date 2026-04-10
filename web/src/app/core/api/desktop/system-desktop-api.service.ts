import { Injectable, inject } from '@angular/core';
import type {
  AppInfo,
  DesktopIntegrationStatus,
  FrameworkUpdateInfo,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
  WindowsSpdDriverInstallResponse,
} from '../../models/desktop-api';
import {
  mapAppInfo,
  mapDesktopIntegrationStatus,
  mapFrameworkUpdateInfo,
  mapPromptPreferenceResponse,
  mapSimpleOkResponse,
  mapWindowsMtkDriverInstallResponse,
  mapWindowsQdloaderDriverInstallResponse,
  mapWindowsQdloaderDriverStatusResponse,
  mapWindowsSpdDriverInstallResponse,
} from '../desktop-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class SystemDesktopApiService {
  private readonly bridge = inject(DesktopBridgeClientService);

  async checkDesktopIntegration(): Promise<DesktopIntegrationStatus> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.checkDesktopIntegration(),
    );
    return mapDesktopIntegrationStatus(response);
  }

  async createDesktopIntegration(): Promise<DesktopIntegrationStatus> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.createDesktopIntegration(),
    );
    return mapDesktopIntegrationStatus(response);
  }

  async getDesktopPromptPreference(): Promise<boolean> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getDesktopPromptPreference(),
    );
    return mapPromptPreferenceResponse(response, false);
  }

  async setDesktopPromptPreference(ask: boolean): Promise<boolean> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.setDesktopPromptPreference({ ask }),
    );
    return mapPromptPreferenceResponse(response, false);
  }

  async getAppInfo(): Promise<AppInfo> {
    const response = await this.bridge.withDesktopApi((desktopApi) => desktopApi.getAppInfo());
    return mapAppInfo(response);
  }

  async openUrl(url: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this.bridge.withDesktopApi((desktopApi) => desktopApi.openUrl(url));
    return mapSimpleOkResponse(response);
  }

  async switchSoftwareFixProtocolToLmfd(): Promise<{ ok: boolean; error?: string }> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.switchSoftwareFixProtocolToLmfd(),
    );
    return mapSimpleOkResponse(response);
  }

  async restoreSoftwareFixProtocolHandler(): Promise<{ ok: boolean; error?: string }> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.restoreSoftwareFixProtocolHandler(),
    );
    return mapSimpleOkResponse(response);
  }

  async checkFrameworkUpdate(): Promise<FrameworkUpdateInfo> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.checkFrameworkUpdate(),
    );
    return mapFrameworkUpdateInfo(response);
  }

  async downloadFrameworkUpdate(): Promise<void> {
    await this.bridge.withDesktopApi((desktopApi) => desktopApi.downloadFrameworkUpdate());
  }

  async applyFrameworkUpdate(): Promise<void> {
    await this.bridge.withDesktopApi((desktopApi) => desktopApi.applyFrameworkUpdate());
  }

  async getWindowsQdloaderDriverStatus(): Promise<WindowsQdloaderDriverStatusResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getWindowsQdloaderDriverStatus(),
    );
    return mapWindowsQdloaderDriverStatusResponse(response);
  }

  async installWindowsQdloaderDriver(): Promise<WindowsQdloaderDriverInstallResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.installWindowsQdloaderDriver(),
    );
    return mapWindowsQdloaderDriverInstallResponse(response);
  }

  async installWindowsSpdDriver(): Promise<WindowsSpdDriverInstallResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.installWindowsSpdDriver(),
    );
    return mapWindowsSpdDriverInstallResponse(response);
  }

  async installWindowsMtkDriver(): Promise<WindowsMtkDriverInstallResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.installWindowsMtkDriver(),
    );
    return mapWindowsMtkDriverInstallResponse(response);
  }
}
