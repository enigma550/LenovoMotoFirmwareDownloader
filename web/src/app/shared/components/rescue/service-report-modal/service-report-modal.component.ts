import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { RescueDialogButtonComponent } from '../rescue-dialog-button/rescue-dialog-button.component';

export interface ServiceReportData {
  deviceModel?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  transport?: string;
  dataResetChoice?: string;
  status: 'success' | 'failed' | 'in_progress';
  date: string;
}

@Component({
  selector: 'app-service-report-modal',
  standalone: true,
  imports: [RescueDialogButtonComponent, TranslatePipe],
  templateUrl: './service-report-modal.component.html',
  styleUrls: ['./service-report-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceReportModalComponent {
  readonly isOpen = input(false);
  readonly isDark = input(false);
  readonly report = input<ServiceReportData | null>(null);
  readonly close = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslationService);
  protected readonly copied = signal(false);
  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.copyTimeout) {
        clearTimeout(this.copyTimeout);
      }
    });
  }

  protected onBackdropClick() {
    this.close.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close.emit();
  }

  protected onDialogClick(event: Event) {
    event.stopPropagation();
  }

  protected printReport() {
    window.print();
  }

  protected async copyReportText() {
    const data = this.report();
    if (!data) return;

    const t = (key: string) => this.i18n.translate(key);
    const text = [
      '========================================',
      t('REPORT.TITLE'),
      'Lenovo & Motorola Firmware Rescue',
      '========================================',
      `${t('REPORT.DATE')}: ${data.date}`,
      `${t('REPORT.DEVICE')}: ${data.deviceModel || 'N/A'}`,
      `${t('REPORT.SERIAL')}: ${data.serialNumber || 'N/A'}`,
      `${t('REPORT.FIRMWARE')}: ${data.firmwareVersion || 'N/A'}`,
      `${t('REPORT.METHOD')}: ${data.transport || 'Fastboot'}`,
      `${t('REPORT.USER_DATA')}: ${
        data.dataResetChoice === 'no' ? t('REPORT.DATA_PRESERVED') : t('REPORT.DATA_WIPED')
      }`,
      `${t('REPORT.OUTCOME')}: ${
        data.status === 'success' ? t('REPORT.STATUS_SUCCESS') : t('REPORT.STATUS_FAILED')
      }`,
      '========================================',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      if (this.copyTimeout) clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // ignore
    }
  }
}
