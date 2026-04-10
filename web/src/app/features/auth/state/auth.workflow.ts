import { Injectable, inject, signal } from '@angular/core';
import { AuthDesktopApiService } from '../../../core/api/desktop';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class AuthWorkflowService {
  private readonly backend = inject(AuthDesktopApiService);
  private readonly ui = inject(WorkflowUiService);
  private waitingForBrowserCallback = false;

  readonly authComplete = signal(false);
  readonly hasStoredAuthorizationToken = signal(false);
  readonly hasCheckedStoredAuthorizationToken = signal(false);

  constructor() {
    void this.loadStoredAuthState();
    void this.consumePendingAuthCallback();
  }

  async openLoginBrowser() {
    await this.ui.runAction('Opening Lenovo login in browser...', async () => {
      const response = await this.backend.startBrowserAuth();
      if (!response.ok) throw new Error(response.error || 'Could not open Lenovo login.');
      this.ui.status.set(
        'Login opened in your browser. Complete sign-in there, then click "Open Lenovo Moto Firmware Downloader" in the softwarefix:// prompt.',
      );
    });
    void this.waitForBrowserCallback();
  }

  async authenticateWithStoredToken() {
    if (!this.hasStoredAuthorizationToken()) {
      this.ui.errorMessage.set('No stored authorization token found.');
      return;
    }

    await this.ui.runAction('Authenticating stored authorization token...', async () => {
      const response = await this.backend.authenticateWithStoredToken();
      if (!response.ok) {
        this.hasStoredAuthorizationToken.set(false);
        throw new Error(response.error || 'Stored token authentication failed.');
      }

      this.authComplete.set(true);
      this.ui.status.set('Authenticated with stored token. Choose lookup source below.');
    });
  }

  ping() {
    return this.backend.ping();
  }

  reconnectDesktopBridge() {
    return this.backend.reconnectDesktopBridge();
  }

  private async loadStoredAuthState() {
    try {
      const response = await this.backend.getStoredAuthState();
      this.hasStoredAuthorizationToken.set(
        Boolean(response.ok && response.hasStoredAuthorizationToken),
      );
    } catch {
      this.hasStoredAuthorizationToken.set(false);
    } finally {
      this.hasCheckedStoredAuthorizationToken.set(true);
    }
  }

  private async consumePendingAuthCallback(): Promise<boolean> {
    try {
      const pending = await this.backend.consumePendingAuthCallback();
      const callbackUrlOrToken = pending.callbackUrlOrToken?.trim() || '';
      if (!pending.ok || !callbackUrlOrToken) return false;

      await this.ui.runAction('Finalizing in-app login callback...', async () => {
        const response = await this.backend.completeAuth(callbackUrlOrToken);
        if (!response.ok) throw new Error(response.error || 'Authentication failed.');
        this.authComplete.set(true);
        this.hasStoredAuthorizationToken.set(true);
        this.ui.status.set('Authenticated from in-app callback. Choose lookup source below.');
      });
      return true;
    } catch {
      // Ignore startup callback errors and let manual login remain available.
      return false;
    }
  }

  private async waitForBrowserCallback() {
    if (this.waitingForBrowserCallback || this.authComplete()) return;
    this.waitingForBrowserCallback = true;
    try {
      for (let attempt = 0; attempt < 180; attempt += 1) {
        if (this.authComplete()) return;
        const consumed = await this.consumePendingAuthCallback();
        if (consumed) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      this.waitingForBrowserCallback = false;
    }
  }
}
