import { Injectable, inject, signal } from '@angular/core';
import { AuthApiService } from '../../api/auth-api.service';
import { WorkflowUiService } from './workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class AuthWorkflowService {
  private readonly backend = inject(AuthApiService);
  private readonly ui = inject(WorkflowUiService);

  readonly callbackUrlOrToken = signal('');
  readonly loginUrl = signal('');
  readonly authComplete = signal(false);
  readonly hasStoredWustToken = signal(false);
  readonly hasCheckedStoredWustToken = signal(false);

  constructor() {
    void this.loadStoredAuthState();
  }

  async openLoginBrowser() {
    await this.ui.runAction('Opening Lenovo login in browser...', async () => {
      const response = await this.backend.startBrowserAuth();
      if (!response.ok) throw new Error(response.error || 'Could not open login browser.');
      this.loginUrl.set(response.loginUrl || '');
      this.ui.status.set('Browser opened. Complete login and paste callback URL/token.');
    });
  }

  async submitWustToken() {
    const value = this.callbackUrlOrToken().trim();
    if (!value) {
      this.ui.errorMessage.set('Paste callback URL or WUST token first.');
      return;
    }

    await this.ui.runAction('Authenticating WUST token...', async () => {
      const response = await this.backend.completeAuth(value);
      if (!response.ok) throw new Error(response.error || 'Authentication failed.');
      this.authComplete.set(true);
      this.hasStoredWustToken.set(true);
      this.ui.status.set('Authenticated. Choose lookup source below.');
    });
  }

  async authenticateWithStoredToken() {
    if (!this.hasStoredWustToken()) {
      this.ui.errorMessage.set('No stored WUST token found.');
      return;
    }

    await this.ui.runAction('Authenticating stored WUST token...', async () => {
      const response = await this.backend.authenticateWithStoredToken();
      if (!response.ok) {
        this.hasStoredWustToken.set(false);
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
      this.hasStoredWustToken.set(Boolean(response.ok && response.hasStoredWustToken));
    } catch {
      this.hasStoredWustToken.set(false);
    } finally {
      this.hasCheckedStoredWustToken.set(true);
    }
  }
}
