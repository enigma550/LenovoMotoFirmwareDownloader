import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { ProjectUpdateErrorCode } from '../../../core/models/desktop-api';
import { AppFacade } from '../../../state';
import { UpdateWorkflowService } from '../state';

@Component({
  selector: 'app-update-dialog',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './update-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateDialogComponent {
  protected readonly update = inject(UpdateWorkflowService);
  protected readonly store = inject(AppFacade);
  protected readonly i18n = inject(TranslationService);

  onBackdropClick() {
    this.update.closeDialog();
  }

  onDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }

  hintKey(code: ProjectUpdateErrorCode | null): string {
    return code ? `UPDATE.HINT.${code}` : '';
  }

  credentialKey(status: string): string {
    switch (status) {
      case 'ok':
        return 'UPDATE.CREDENTIALS_OK';
      case 'auth-failed':
        return 'UPDATE.CREDENTIALS_AUTH_FAILED';
      case 'network-failed':
        return 'UPDATE.CREDENTIALS_NETWORK_FAILED';
      case 'missing-remote':
        return 'UPDATE.CREDENTIALS_MISSING_REMOTE';
      case 'not-applicable':
        return 'UPDATE.CREDENTIALS_NOT_APPLICABLE';
      default:
        return 'UPDATE.CREDENTIALS_UNKNOWN';
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.update.closeDialog();
  }
}
