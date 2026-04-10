import { Component, inject, signal } from '@angular/core';
import { AboutFacade } from '../state';

@Component({
  selector: 'app-desktop-prompt-modal',
  standalone: true,
  templateUrl: './desktop-prompt-modal.component.html',
})
export class DesktopPromptModalComponent {
  protected readonly store = inject(AboutFacade);
  protected isProcessing = signal(false);
  protected dontAskAgain = signal(false);

  async createShortcut() {
    this.isProcessing.set(true);
    await this.store.createDesktopIntegration();
    if (this.dontAskAgain()) {
      await this.store.setDesktopPromptPreference(false);
    }
    this.store.showDesktopPrompt.set(false);
    this.isProcessing.set(false);
  }

  async dismiss() {
    if (this.dontAskAgain()) {
      await this.store.setDesktopPromptPreference(false);
    }
    this.store.showDesktopPrompt.set(false);
  }

  toggleDontAsk(event: Event) {
    const target = event.target as HTMLInputElement;
    this.dontAskAgain.set(target.checked);
  }
}
