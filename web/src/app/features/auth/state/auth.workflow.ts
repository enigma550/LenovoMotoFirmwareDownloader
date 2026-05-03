import { Injectable, inject, signal } from '@angular/core';
import { AuthDesktopApiService } from '../../../core/api/desktop';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class AuthWorkflowService {
  private readonly backend = inject(AuthDesktopApiService);
  private readonly ui = inject(WorkflowUiService);
  private waitingForBrowserCallback = false;

  readonly authComplete = signal(false);
  readonly showInAppAuthOption = signal(false);
  readonly hasStoredAuthorizationToken = signal(false);
  readonly hasCheckedStoredAuthorizationToken = signal(false);

  constructor() {
    void this.loadStoredAuthState();
    void this.consumePendingAuthCallback();
  }

  async openLoginBrowser() {
    await this.ui.runAction('Opening Lenovo login in browser...', async () => {
      const response = await this.backend.startBrowserAuth();
      if (!response.ok) {
        throw new Error(response.error || 'Could not prepare Lenovo login.');
      }

      this.showInAppAuthOption.set(true);
      if (response.openedInExternalBrowser) {
        this.ui.status.set('Login opened in your browser. Complete sign-in there to continue.');
        return;
      }

      this.ui.status.set('The browser opener did not report success. Try in-app login instead.');
    });
    void this.waitForBrowserCallback();
  }

  async openInAppLogin() {
    await this.ui.runAction('Opening Lenovo login inside LMFD...', async () => {
      const response = await this.backend.startInAppAuth();
      if (!response.ok) {
        throw new Error(response.error || 'Could not open in-app Lenovo login.');
      }

      this.showInAppAuthOption.set(true);
      this.ui.status.set('Lenovo login opened inside LMFD. Use Dashboard to return.');
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

      this.markAuthenticated('Authenticated with stored token. Choose lookup source below.');
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

      await this.completeAuthInput(
        callbackUrlOrToken,
        'Finalizing browser login callback...',
        'Authenticated from browser callback. Choose lookup source below.',
      );
      return true;
    } catch {
      // Ignore startup callback errors and let the normal browser login remain available.
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

  private async completeAuthInput(
    callbackUrlOrToken: string,
    actionStatus: string,
    successStatus: string,
  ) {
    await this.ui.runAction(actionStatus, async () => {
      const response = await this.backend.completeAuth(callbackUrlOrToken);
      if (!response.ok) throw new Error(response.error || 'Authentication failed.');
      this.markAuthenticated(successStatus);
    });
  }

  private markAuthenticated(status: string) {
    this.authComplete.set(true);
    this.hasStoredAuthorizationToken.set(true);
    this.showInAppAuthOption.set(false);
    this.ui.status.set(status);
  }
}
