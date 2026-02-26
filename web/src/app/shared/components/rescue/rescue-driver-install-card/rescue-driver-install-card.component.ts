import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RescueDialogButtonComponent } from '../rescue-dialog-button/rescue-dialog-button.component';

@Component({
  selector: 'app-rescue-driver-install-card',
  standalone: true,
  imports: [RescueDialogButtonComponent],
  templateUrl: './rescue-driver-install-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescueDriverInstallCardComponent {
  readonly isDark = input(false);
  readonly title = input('');
  readonly description = input('');
  readonly buttonLabel = input('Install Driver');
  readonly buttonDisabled = input(false);
  readonly installed = input(false);
  readonly installedNote = input('');

  readonly install = output<void>();

  protected onInstall() {
    this.install.emit();
  }
}
