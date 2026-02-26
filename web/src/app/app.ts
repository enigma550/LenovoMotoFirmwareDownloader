import type { OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { WorkflowStore } from './core/state/workflow/workflow.store';
import { AboutWorkspaceComponent } from './features/about/about-workspace/about-workspace.component';
import { DesktopPromptModalComponent } from './features/about/desktop-prompt-modal/desktop-prompt-modal.component';
import { AuthPanelComponent } from './features/auth/auth-panel/auth-panel.component';
import { CatalogWorkspaceComponent } from './features/catalog/catalog-workspace/catalog-workspace.component';
import { ConnectedLookupComponent } from './features/connected/connected-lookup/connected-lookup.component';
import { DownloadsPanelComponent } from './features/downloads/downloads-panel/downloads-panel.component';
import { RescueWorkspaceComponent } from './features/rescue/rescue-workspace/rescue-workspace.component';
import { SourceModeComponent } from './features/source/source-mode/source-mode.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AuthPanelComponent,
    SourceModeComponent,
    ConnectedLookupComponent,
    CatalogWorkspaceComponent,
    DownloadsPanelComponent,
    RescueWorkspaceComponent,
    AboutWorkspaceComponent,
    DesktopPromptModalComponent,
  ],
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly store = inject(WorkflowStore);

  async ngOnInit() {
    const info = await this.store.loadAppInfo();

    if (info?.platform === 'linux') {
      const res = await this.store.checkDesktopIntegration();

      if (res.status === 'wrong_wmclass') {
        // Silently fix the WMClass in the existing file (e.g. Gear Lever)
        await this.store.createDesktopIntegration();
      } else if (res.status === 'missing') {
        const ask = await this.store.getDesktopPromptPreference();
        if (ask) {
          this.store.showDesktopPrompt.set(true);
        }
      }
    }
  }
}
