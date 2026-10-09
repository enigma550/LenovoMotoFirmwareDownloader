import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { flashTransportLabel as formatFlashTransportLabel } from '../../../../features/downloads/state/download-utils';
import type { RescueDryRunPlanDialog } from '../../../../shared/state/workflow.types';
import { RescueDialogButtonComponent } from '../rescue-dialog-button/rescue-dialog-button.component';

@Component({
  selector: 'app-rescue-dry-run-plan-dialog',
  standalone: true,
  imports: [RescueDialogButtonComponent, TranslatePipe],
  templateUrl: './rescue-dry-run-plan-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescueDryRunPlanDialogComponent {
  readonly plan = input<RescueDryRunPlanDialog | null>(null);
  readonly isDark = input(false);
  readonly close = output<void>();
  protected readonly flashTransportLabel = formatFlashTransportLabel;
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslationService);
  private readonly copyStatus = signal<'idle' | 'copied' | 'failed'>('idle');
  private resetCopyStatusTimeout: ReturnType<typeof setTimeout> | null = null;
  protected readonly copyButtonLabel = computed(() => {
    this.i18n.currentLang();
    const status = this.copyStatus();
    if (status === 'copied') {
      return this.i18n.translate('COMMON.COPIED');
    }
    if (status === 'failed') {
      return this.i18n.translate('COMMON.COPY_FAILED');
    }
    return this.i18n.translate('COMMON.COPY');
  });
  protected readonly hasCommands = computed(() => (this.plan()?.commands.length ?? 0) > 0);

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.resetCopyStatusTimeout) {
        clearTimeout(this.resetCopyStatusTimeout);
        this.resetCopyStatusTimeout = null;
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

  protected async onCopyCommands() {
    const commands = this.plan()?.commands || [];
    if (commands.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(commands.join('\n'));
      this.copyStatus.set('copied');
    } catch {
      this.copyStatus.set('failed');
    }

    this.scheduleCopyStatusReset();
  }

  protected onDialogClick(event: Event) {
    event.stopPropagation();
  }

  private scheduleCopyStatusReset() {
    if (this.resetCopyStatusTimeout) {
      clearTimeout(this.resetCopyStatusTimeout);
    }
    this.resetCopyStatusTimeout = setTimeout(() => {
      this.copyStatus.set('idle');
      this.resetCopyStatusTimeout = null;
    }, 1800);
  }
}
