import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RescueFlashTransport, RescueQdlStorage } from '../../../../core/models/desktop-api';
import type { DataResetChoice } from '../../../../core/state/workflow/workflow.types';
import { RescueDialogButtonComponent } from '../rescue-dialog-button/rescue-dialog-button.component';

@Component({
  selector: 'app-rescue-options-dialog',
  standalone: true,
  imports: [RescueDialogButtonComponent],
  templateUrl: './rescue-options-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescueOptionsDialogComponent {
  readonly isOpen = input(false);
  readonly isDark = input(false);
  readonly title = input('Rescue Lite');
  readonly description = input('');
  readonly targetLabel = input('');
  readonly dryRun = input(false);
  readonly dataReset = input<DataResetChoice>('yes');
  readonly flashTransport = input<RescueFlashTransport>('fastboot');
  readonly qdlStorage = input<RescueQdlStorage>('auto');
  readonly qdlSerial = input('');
  readonly driverInstallBusy = input(false);
  readonly showWindowsDriverInstall = input(false);

  readonly close = output<void>();
  readonly confirm = output<void>();
  readonly installWindowsDriver = output<void>();
  readonly dataResetChange = output<DataResetChoice>();
  readonly flashTransportChange = output<RescueFlashTransport>();
  readonly qdlStorageChange = output<RescueQdlStorage>();
  readonly qdlSerialChange = output<string>();

  protected onBackdropClick() {
    this.close.emit();
  }

  protected onDialogClick(event: Event) {
    event.stopPropagation();
  }

  protected onSelectDataReset(choice: DataResetChoice) {
    this.dataResetChange.emit(choice);
  }

  protected onSelectFlashTransport(transport: RescueFlashTransport) {
    this.flashTransportChange.emit(transport);
  }

  protected onSelectQdlStorage(storage: RescueQdlStorage) {
    this.qdlStorageChange.emit(storage);
  }

  protected onQdlSerialInput(event: Event) {
    const inputElement = event.target as HTMLInputElement | null;
    this.qdlSerialChange.emit(inputElement?.value || '');
  }

  protected onConfirm() {
    this.confirm.emit();
  }

  protected onInstallWindowsDriver() {
    this.installWindowsDriver.emit();
  }
}
