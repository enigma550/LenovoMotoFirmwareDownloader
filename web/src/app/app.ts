import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ensureDesktopBridgeReady } from './core/bridge/electrobun-bridge';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { TranslationService } from './core/i18n/translation.service';
import { AboutWorkspaceComponent } from './features/about/about-workspace/about-workspace.component';
import { DesktopPromptModalComponent } from './features/about/desktop-prompt-modal/desktop-prompt-modal.component';
import { AppStoreWorkspaceComponent } from './features/app-store/app-store-workspace/app-store-workspace.component';
import { AuthPanelComponent } from './features/auth/auth-panel/auth-panel.component';
import { BackupRestoreWorkspaceComponent } from './features/backup-restore/backup-restore-workspace/backup-restore-workspace.component';
import { CatalogWorkspaceComponent } from './features/catalog/catalog-workspace/catalog-workspace.component';
import { ConnectedLookupComponent } from './features/connected/connected-lookup/connected-lookup.component';
import { DownloadsPanelComponent } from './features/downloads/downloads-panel/downloads-panel.component';
import { RescueWorkspaceComponent } from './features/rescue/rescue-workspace/rescue-workspace.component';
import { SourceModeComponent } from './features/source/source-mode/source-mode.component';
import { UpdateWorkflowService } from './features/update/state';
import { UpdateDialogComponent } from './features/update/update-dialog/update-dialog.component';
import { ConfirmDialogComponent } from './shared/components/ui/confirm-dialog/confirm-dialog.component';
import { AppFacade } from './state';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    TranslatePipe,
    AuthPanelComponent,
    SourceModeComponent,
    ConnectedLookupComponent,
    CatalogWorkspaceComponent,
    DownloadsPanelComponent,
    BackupRestoreWorkspaceComponent,
    AppStoreWorkspaceComponent,
    RescueWorkspaceComponent,
    AboutWorkspaceComponent,
    DesktopPromptModalComponent,
    UpdateDialogComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly store = inject(AppFacade);
  protected readonly i18n = inject(TranslationService);
  protected readonly update = inject(UpdateWorkflowService);

  async ngOnInit() {
    await ensureDesktopBridgeReady();

    const info = await this.store.loadAppInfo();
    if (!info) {
      return;
    }

    if (info.platform === 'win32') {
      const res = await this.store.checkDesktopIntegration();
      if (res.status === 'ok') {
        return;
      }

      const ask = await this.store.getDesktopPromptPreference();
      if (ask) {
        this.store.desktopPromptReason.set('windows_protocol_handler');
        this.store.showDesktopPrompt.set(true);
      }
      return;
    }

    if (info.platform !== 'linux') {
      return;
    }

    const res = await this.store.checkDesktopIntegration();
    if (res.status === 'wrong_wmclass') {
      await this.store.createDesktopIntegration();
      return;
    }

    if (res.status !== 'missing') {
      return;
    }

    const ask = await this.store.getDesktopPromptPreference();
    if (ask) {
      this.store.desktopPromptReason.set('missing');
      this.store.showDesktopPrompt.set(true);
    }
  }
}
