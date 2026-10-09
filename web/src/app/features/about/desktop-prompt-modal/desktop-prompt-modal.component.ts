import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AboutFacade } from '../state';

@Component({
  selector: 'app-desktop-prompt-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './desktop-prompt-modal.component.html',
})
export class DesktopPromptModalComponent {
  protected readonly store = inject(AboutFacade);
  protected isProcessing = signal(false);
  protected dontAskAgain = signal(false);

  protected isWindowsPrompt() {
    return this.store.desktopPromptReason() === 'windows_protocol_handler';
  }

  async runPrimaryAction() {
    this.isProcessing.set(true);
    if (this.isWindowsPrompt()) {
      const result = await this.store.switchSoftwareFixProtocolToLmfd();
      if (!result.ok) {
        this.isProcessing.set(false);
        return;
      }
    } else {
      await this.store.createDesktopIntegration();
    }
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

  @HostListener('document:keydown.escape')
  onEscape() {
    if (!this.isProcessing()) {
      void this.dismiss();
    }
  }
}
