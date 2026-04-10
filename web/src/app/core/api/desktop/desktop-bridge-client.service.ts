import { Injectable } from '@angular/core';
import {
  ensureDesktopBridgeReady,
  getDesktopBridgeError,
  isDesktopRuntimeSignalPresent,
  reconnectDesktopBridge,
} from '../../bridge/electrobun-bridge';

type BridgeFailureResponse = {
  ok: boolean;
  error?: string;
};

@Injectable({ providedIn: 'root' })
export class DesktopBridgeClientService {
  isDesktopRuntime() {
    if (window.desktopApi?.isDesktop) {
      return true;
    }

    return isDesktopRuntimeSignalPresent();
  }

  reconnectDesktopBridge() {
    return reconnectDesktopBridge();
  }

  async withDesktopApi<T>(
    action: (desktopApi: NonNullable<typeof window.desktopApi>) => Promise<T>,
  ): Promise<T> {
    const desktopApi = await this.getDesktopApi();
    return action(desktopApi);
  }

  async runAuthAction<T extends BridgeFailureResponse>(
    desktopAction: (desktopApi: NonNullable<typeof window.desktopApi>) => Promise<T>,
    webAction: () => Promise<T>,
  ): Promise<T> {
    if (this.isDesktopRuntime()) {
      await ensureDesktopBridgeReady();
    }

    const desktopApi = window.desktopApi;
    if (desktopApi?.isDesktop) {
      return desktopAction(desktopApi);
    }

    if (this.isDesktopRuntime()) {
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

  private async getDesktopApi() {
    if (this.isDesktopRuntime()) {
      await ensureDesktopBridgeReady();
    }

    const desktopApi = window.desktopApi;
    if (desktopApi?.isDesktop) {
      return desktopApi;
    }

    if (this.isDesktopRuntime()) {
      const bridgeError = getDesktopBridgeError();
      throw new Error(
        bridgeError
          ? `Desktop bridge failed: ${bridgeError}`
          : 'Desktop bridge was not initialized. Restart the app.',
      );
    }

    throw new Error('This action requires desktop mode. Run `bun run start`.');
  }
}
