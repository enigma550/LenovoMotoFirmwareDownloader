import { Injectable, inject } from '@angular/core';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { AuthWorkflowService } from './auth.workflow';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly auth = inject(AuthWorkflowService);

  readonly isDark = this.ui.isDark;
  readonly authComplete = this.auth.authComplete;
  readonly hasStoredAuthorizationToken = this.auth.hasStoredAuthorizationToken;
  readonly hasCheckedStoredAuthorizationToken = this.auth.hasCheckedStoredAuthorizationToken;

  async openLoginBrowser() {
    await this.auth.openLoginBrowser();
  }

  async authenticateWithStoredToken() {
    await this.auth.authenticateWithStoredToken();
  }
}
