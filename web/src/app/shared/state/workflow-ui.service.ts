import { HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { TranslationService } from '../../core/i18n/translation.service';
import { ConfirmDialogService } from './confirm-dialog.service';
import { readInitialThemeMode, writeThemeMode } from './theme-mode.storage';
import type { ThemeMode, ToastMessage, ToastVariant } from './workflow.types';

@Injectable({ providedIn: 'root' })
export class WorkflowUiService {
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly i18n = inject(TranslationService);
  private toastIdCounter = 0;
  private readonly activeActionCount = signal(0);

  readonly status = signal('Idle');
  readonly errorMessage = signal('');
  readonly themeMode = signal<ThemeMode>(readInitialThemeMode());
  readonly toasts = signal<ToastMessage[]>([]);

  readonly isBusy = computed(() => this.activeActionCount() > 0);
  readonly isDark = computed(() => this.themeMode() === 'dark');

  toggleTheme() {
    const nextTheme: ThemeMode = this.themeMode() === 'dark' ? 'light' : 'dark';
    this.themeMode.set(nextTheme);
    writeThemeMode(nextTheme);
    this.showToast(
      this.i18n.translate(nextTheme === 'dark' ? 'THEME.SWITCHED_DARK' : 'THEME.SWITCHED_LIGHT'),
      'info',
      2000,
    );
  }

  showToast(message: string, variant: ToastVariant = 'info', timeoutMs = 2600) {
    const id = ++this.toastIdCounter;
    this.toasts.update((current) => [...current, { id, message, variant }]);
    if (timeoutMs > 0) {
      setTimeout(() => this.dismissToast(id), timeoutMs);
    }
    return id;
  }

  dismissToast(id: number) {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }

  async runAction(statusText: string, action: () => Promise<void>) {
    this.activeActionCount.update((count) => count + 1);
    this.errorMessage.set('');
    this.status.set(statusText);
    this.showToast(statusText, 'info', 1800);
    try {
      await action();
      this.showToast(this.status(), 'success', 2600);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.errorMessage.set(message);
      this.showToast(message, 'error', 4200);
      this.status.set('Idle');
    } finally {
      this.activeActionCount.update((count) => Math.max(0, count - 1));
    }
  }

  getErrorMessage<ErrorValue>(error: ErrorValue) {
    if (error instanceof HttpErrorResponse) {
      const payload = error.error as { error?: string } | null;
      return payload?.error || error.message || this.i18n.translate('ERRORS.REQUEST_FAILED');
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }

  confirm(title: string, message: string): Promise<boolean> {
    return this.confirmDialog.confirm(title, message);
  }
}
