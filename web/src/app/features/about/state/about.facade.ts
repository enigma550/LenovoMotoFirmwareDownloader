import { Injectable, inject } from '@angular/core';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { SystemWorkflowService } from '../../system/state/system.workflow';

@Injectable({ providedIn: 'root' })
export class AboutFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly system = inject(SystemWorkflowService);

  readonly isDark = this.ui.isDark;
  readonly showDesktopPrompt = this.system.showDesktopPrompt;
  readonly desktopPromptReason = this.system.desktopPromptReason;
  readonly appInfo = this.system.appInfo;
  readonly bridgeHealthy = this.system.bridgeHealthy;
  readonly bridgeStatus = this.system.bridgeStatus;

  async loadAppInfo() {
    return this.system.loadAppInfo();
  }

  async checkDesktopIntegration() {
    return this.system.checkDesktopIntegration();
  }

  async createDesktopIntegration() {
    return this.system.createDesktopIntegration();
  }

  async setDesktopPromptPreference(ask: boolean) {
    return this.system.setDesktopPromptPreference(ask);
  }

  async getDesktopPromptPreference() {
    return this.system.getDesktopPromptPreference();
  }

  async openUrl(url: string) {
    return this.system.openUrl(url);
  }

  async switchSoftwareFixProtocolToLmfd() {
    return this.system.switchSoftwareFixProtocolToLmfd();
  }

  async restoreSoftwareFixProtocolHandler() {
    return this.system.restoreSoftwareFixProtocolHandler();
  }

  async checkFrameworkUpdate() {
    return this.system.checkFrameworkUpdate();
  }

  async downloadFrameworkUpdate() {
    return this.system.downloadFrameworkUpdate();
  }

  async applyFrameworkUpdate() {
    return this.system.applyFrameworkUpdate();
  }
}
