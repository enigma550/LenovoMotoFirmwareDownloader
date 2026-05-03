import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AuthCompleteRequest,
  AuthCompleteResponse,
  AuthStartResponse,
  BridgePingResponse,
  PendingAuthCallbackResponse,
  StoredAuthStateResponse,
} from '../../models/desktop-api';
import {
  mapAuthCompleteResponse,
  mapAuthStartResponse,
  mapBridgePingResponse,
  mapPendingAuthCallbackResponse,
  mapStoredAuthStateResponse,
} from '../desktop-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class AuthDesktopApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly bridge = inject(DesktopBridgeClientService);

  async startBrowserAuth(): Promise<AuthStartResponse> {
    const response = await this.bridge.runAuthAction(
      (desktopApi) => desktopApi.startAuth(),
      () => firstValueFrom(this.httpClient.post<AuthStartResponse>('/api/auth/start', {})),
    );

    return mapAuthStartResponse(response);
  }

  async startInAppAuth(): Promise<AuthStartResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) => desktopApi.startInAppAuth());
    return mapAuthStartResponse(response);
  }

  async completeAuth(
    callbackUrlOrToken: AuthCompleteRequest['callbackUrlOrToken'],
  ): Promise<AuthCompleteResponse> {
    const response = await this.bridge.runAuthAction(
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

  async consumePendingAuthCallback(): Promise<PendingAuthCallbackResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.consumePendingAuthCallback(),
    );
    return mapPendingAuthCallbackResponse(response);
  }

  async getStoredAuthState(): Promise<StoredAuthStateResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getStoredAuthState(),
    );
    return mapStoredAuthStateResponse(response);
  }

  async authenticateWithStoredToken(): Promise<AuthCompleteResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.authWithStoredToken(),
    );
    return mapAuthCompleteResponse(response);
  }

  async ping(): Promise<BridgePingResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) => desktopApi.ping());
    return mapBridgePingResponse(response);
  }

  reconnectDesktopBridge() {
    return this.bridge.reconnectDesktopBridge();
  }
}
