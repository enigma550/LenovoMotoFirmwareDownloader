import { Injectable, inject, signal } from '@angular/core';
import { AuthApiService } from '../../api/auth-api.service';
import type {
  AppInfo,
  DesktopIntegrationStatus,
  FrameworkUpdateInfo,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
  WindowsSpdDriverInstallResponse,
} from '../../models/desktop-api';
import { AuthWorkflowService } from './auth-workflow.service';
import { WorkflowUiService } from './workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class SystemWorkflowService {
  private readonly backend = inject(AuthApiService);
  private readonly ui = inject(WorkflowUiService);
  private readonly auth = inject(AuthWorkflowService);

  readonly showDesktopPrompt = signal(false);
  readonly desktopPromptReason = signal<'missing' | 'wrong_wmclass'>('missing');
  readonly appInfo = signal<AppInfo | null>(null);
  readonly bridgeHealthy = signal(true);
  readonly bridgeLatencyMs = signal<number | null>(null);
  readonly bridgeStatus = signal('Bridge connected');

  private bridgeReconnectInFlight = false;

  constructor() {
    if (window.location.protocol === 'views:') {
      void this.checkBridgeHealth(true);
      setInterval(() => {
        void this.checkBridgeHealth(true);
      }, 15000);
    }
  }

  async checkDesktopIntegration() {
    try {
      return await this.backend.checkDesktopIntegration();
    } catch {
      return { ok: false, status: 'missing' } as DesktopIntegrationStatus;
    }
  }

  async createDesktopIntegration() {
    try {
      return await this.backend.createDesktopIntegration();
    } catch {
      return { ok: false, status: 'missing' } as DesktopIntegrationStatus;
    }
  }

  async getDesktopPromptPreference() {
    try {
      return await this.backend.getDesktopPromptPreference();
    } catch {
      return false;
    }
  }

  async setDesktopPromptPreference(ask: boolean) {
    try {
      return await this.backend.setDesktopPromptPreference(ask);
    } catch {
      return false;
    }
  }

  async loadAppInfo() {
    try {
      const info = await this.backend.getAppInfo();
      this.appInfo.set(info);
      return info;
    } catch {
      return null;
    }
  }

  async openUrl(url: string) {
    try {
      return await this.backend.openUrl(url);
    } catch {
      return { ok: false, error: 'Desktop API not available' };
    }
  }

  async checkFrameworkUpdate(): Promise<FrameworkUpdateInfo | null> {
    try {
      return await this.backend.checkFrameworkUpdate();
    } catch {
      return null;
    }
  }

  async downloadFrameworkUpdate() {
    try {
      await this.backend.downloadFrameworkUpdate();
    } catch {
      // Ignore when desktop API is unavailable.
    }
  }

  async applyFrameworkUpdate() {
    try {
      await this.backend.applyFrameworkUpdate();
    } catch {
      // Ignore when desktop API is unavailable.
    }
  }

  async getWindowsQdloaderDriverStatus(): Promise<WindowsQdloaderDriverStatusResponse> {
    try {
      return await this.backend.getWindowsQdloaderDriverStatus();
    } catch {
      return {
        ok: false,
        installed: false,
        error: 'Unable to read Windows QDLoader driver status.',
      };
    }
  }

  async installWindowsQdloaderDriver() {
    try {
      this.ui.status.set('Installing Windows QDLoader driver...');
      const response = await this.backend.installWindowsQdloaderDriver();
      if (response.ok) {
        this.ui.status.set(
          response.attempted
            ? 'Windows QDLoader driver install completed.'
            : 'Windows QDLoader driver is already installed.',
        );
        this.ui.showToast(
          response.detail ||
            (response.attempted
              ? 'Windows QDLoader driver install completed.'
              : 'Windows QDLoader driver is already installed.'),
          'success',
          3200,
        );
      } else {
        const message =
          response.error || response.detail || 'Windows QDLoader driver install failed.';
        this.ui.status.set('Windows QDLoader driver install failed.');
        this.ui.showToast(message, 'error', 4600);
      }
      return response;
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.status.set('Windows QDLoader driver install failed.');
      this.ui.showToast(message, 'error', 4600);
      return {
        ok: false,
        attempted: true,
        method: 'qdloader-setup' as const,
        error: message,
      };
    }
  }

  async installWindowsSpdDriver(): Promise<WindowsSpdDriverInstallResponse> {
    try {
      this.ui.status.set('Installing Windows SPD driver...');
      const response = await this.backend.installWindowsSpdDriver();
      if (response.ok) {
        this.ui.status.set('Windows SPD driver install completed.');
        this.ui.showToast(
          response.detail || 'Windows SPD driver install completed.',
          'success',
          3200,
        );
      } else {
        const message = response.error || response.detail || 'Windows SPD driver install failed.';
        this.ui.status.set('Windows SPD driver install failed.');
        this.ui.showToast(message, 'error', 4600);
      }
      return response;
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.status.set('Windows SPD driver install failed.');
      this.ui.showToast(message, 'error', 4600);
      return {
        ok: false,
        attempted: true,
        method: 'spd-setup',
        error: message,
      };
    }
  }

  async installWindowsMtkDriver(): Promise<WindowsMtkDriverInstallResponse> {
    try {
      this.ui.status.set('Installing Windows MediaTek driver...');
      const response = await this.backend.installWindowsMtkDriver();
      if (response.ok) {
        this.ui.status.set('Windows MediaTek driver install completed.');
        this.ui.showToast(
          response.detail || 'Windows MediaTek driver install completed.',
          'success',
          3200,
        );
      } else {
        const message =
          response.error || response.detail || 'Windows MediaTek driver install failed.';
        this.ui.status.set('Windows MediaTek driver install failed.');
        this.ui.showToast(message, 'error', 4600);
      }
      return response;
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.status.set('Windows MediaTek driver install failed.');
      this.ui.showToast(message, 'error', 4600);
      return {
        ok: false,
        attempted: true,
        method: 'mtk-setup',
        error: message,
      };
    }
  }

  private async checkBridgeHealth(silent: boolean) {
    const startedAt = performance.now();
    try {
      const response = await this.auth.ping();
      if (!response.ok) {
        throw new Error(response.error || 'Bridge ping failed.');
      }

      const latency = Math.max(0, Math.round(performance.now() - startedAt));
      this.bridgeHealthy.set(true);
      this.bridgeLatencyMs.set(latency);
      this.bridgeStatus.set(`Bridge connected (${latency} ms)`);
      return;
    } catch {
      this.bridgeHealthy.set(false);
      this.bridgeLatencyMs.set(null);
      this.bridgeStatus.set('Bridge disconnected. Reconnecting...');
    }

    if (this.bridgeReconnectInFlight) {
      return;
    }

    this.bridgeReconnectInFlight = true;
    try {
      const reconnected = await this.auth.reconnectDesktopBridge();
      if (!reconnected) {
        this.bridgeStatus.set('Bridge reconnect failed. Retry on next check.');
        if (!silent) {
          this.ui.showToast('Desktop bridge reconnect failed.', 'error', 2600);
        }
        return;
      }

      const reconnectStartedAt = performance.now();
      const response = await this.auth.ping();
      if (!response.ok) {
        throw new Error(response.error || 'Bridge ping failed after reconnect.');
      }
      const latency = Math.max(0, Math.round(performance.now() - reconnectStartedAt));
      this.bridgeHealthy.set(true);
      this.bridgeLatencyMs.set(latency);
      this.bridgeStatus.set(`Bridge reconnected (${latency} ms)`);
      if (!silent) {
        this.ui.showToast('Desktop bridge reconnected.', 'success', 2200);
      }
    } catch {
      this.bridgeHealthy.set(false);
      this.bridgeLatencyMs.set(null);
      this.bridgeStatus.set('Bridge reconnect failed. Retry on next check.');
      if (!silent) {
        this.ui.showToast('Desktop bridge reconnect failed.', 'error', 2600);
      }
    } finally {
      this.bridgeReconnectInFlight = false;
    }
  }
}
