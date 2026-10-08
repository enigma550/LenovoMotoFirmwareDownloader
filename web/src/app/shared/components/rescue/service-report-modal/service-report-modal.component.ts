import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
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

  protected onDialogClick(event: Event) {
    event.stopPropagation();
  }

  protected printReport() {
    window.print();
  }

  protected async copyReportText() {
    const data = this.report();
    if (!data) return;

    const text = [
      '========================================',
      'COMPROVANTE DE ATENDIMENTO TÉCNICO',
      'Lenovo & Motorola Firmware Rescue',
      '========================================',
      `Data/Hora: ${data.date}`,
      `Dispositivo: ${data.deviceModel || 'N/A'}`,
      `Número de Série / SN: ${data.serialNumber || 'N/A'}`,
      `Firmware Instalado: ${data.firmwareVersion || 'N/A'}`,
      `Método: ${data.transport || 'Fastboot'}`,
      `Dados do Usuário: ${data.dataResetChoice === 'no' ? 'Preservados' : 'Reset de Fábrica'}`,
      `Status: ${data.status === 'success' ? 'Concluído com Êxito' : 'Falha / Não Concluído'}`,
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
