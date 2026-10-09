import { Injectable, inject } from '@angular/core';
import type {
  CancelProjectUpdateResponse,
  CheckProjectUpdateResponse,
  GetProjectUpdateLogResponse,
  StartProjectUpdateRequest,
  StartProjectUpdateResponse,
} from '../../models/desktop-api';
import {
  mapCancelProjectUpdateResponse,
  mapCheckProjectUpdateResponse,
  mapGetProjectUpdateLogResponse,
  mapStartProjectUpdateResponse,
} from '../update-response.mapper';
import { DesktopBridgeClientService } from './desktop-bridge-client.service';

@Injectable({ providedIn: 'root' })
export class UpdateDesktopApiService {
  private readonly bridge = inject(DesktopBridgeClientService);

  async checkProjectUpdate(): Promise<CheckProjectUpdateResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.checkProjectUpdate(),
    );
    return mapCheckProjectUpdateResponse(response);
  }

  async startProjectUpdate(
    payload?: StartProjectUpdateRequest,
  ): Promise<StartProjectUpdateResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.startProjectUpdate(payload),
    );
    return mapStartProjectUpdateResponse(response);
  }

  async cancelProjectUpdate(): Promise<CancelProjectUpdateResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.cancelProjectUpdate(),
    );
    return mapCancelProjectUpdateResponse(response);
  }

  async getProjectUpdateLog(): Promise<GetProjectUpdateLogResponse> {
    const response = await this.bridge.withDesktopApi((desktopApi) =>
      desktopApi.getProjectUpdateLog(),
    );
    return mapGetProjectUpdateLogResponse(response);
  }
}
