import { Injectable, inject } from '@angular/core';
import { AboutFacade } from '../features/about/state';
import { AuthFacade } from '../features/auth/state';
import { CatalogFacade } from '../features/catalog/state';
import type { SourceMode } from '../shared/state/workflow.types';
import { WorkflowUiService } from '../shared/state/workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class AppFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly auth = inject(AuthFacade);
  private readonly catalog = inject(CatalogFacade);
  private readonly about = inject(AboutFacade);

  readonly isDark = this.ui.isDark;
  readonly isBusy = this.ui.isBusy;
  readonly status = this.ui.status;
  readonly errorMessage = this.ui.errorMessage;
  readonly toasts = this.ui.toasts;

  readonly authComplete = this.auth.authComplete;
  readonly sourceMode = this.catalog.sourceMode;
  readonly selectedModel = this.catalog.selectedModel;
  readonly bridgeHealthy = this.about.bridgeHealthy;
  readonly bridgeStatus = this.about.bridgeStatus;
  readonly showDesktopPrompt = this.about.showDesktopPrompt;

  toggleTheme() {
    this.ui.toggleTheme();
  }

  dismissToast(id: number) {
    this.ui.dismissToast(id);
  }

  setSourceMode(mode: SourceMode) {
    this.catalog.setSourceMode(mode);
  }

  async loadAppInfo() {
    return this.about.loadAppInfo();
  }

  async checkDesktopIntegration() {
    return this.about.checkDesktopIntegration();
  }

  async createDesktopIntegration() {
    return this.about.createDesktopIntegration();
  }

  async getDesktopPromptPreference() {
    return this.about.getDesktopPromptPreference();
  }

  async setDesktopPromptPreference(ask: boolean) {
    return this.about.setDesktopPromptPreference(ask);
  }
}
