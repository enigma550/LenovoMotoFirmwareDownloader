import { HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import type { ThemeMode, ToastMessage, ToastVariant } from './workflow.types';

function getInitialTheme(): ThemeMode {
  try {
    const storedTheme = globalThis.localStorage?.getItem('theme_mode');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
  } catch {
    // Ignore storage access errors and fallback to dark mode.
  }
  return 'dark';
}

@Injectable({ providedIn: 'root' })
export class WorkflowUiService {
  private toastIdCounter = 0;
  private readonly activeActionCount = signal(0);

  readonly status = signal('Idle');
  readonly errorMessage = signal('');
  readonly themeMode = signal<ThemeMode>(getInitialTheme());
  readonly toasts = signal<ToastMessage[]>([]);

  readonly isBusy = computed(() => this.activeActionCount() > 0);
  readonly isDark = computed(() => this.themeMode() === 'dark');

  toggleTheme() {
    const nextTheme: ThemeMode = this.themeMode() === 'dark' ? 'light' : 'dark';
    this.themeMode.set(nextTheme);
    try {
      globalThis.localStorage?.setItem('theme_mode', nextTheme);
    } catch {
      // Ignore storage access errors.
    }
    this.showToast(`Switched to ${nextTheme} mode.`, 'info', 2000);
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

  getErrorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) {
      const payload = error.error as { error?: string } | null;
      return payload?.error || error.message || 'Request failed.';
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }

  confirm(title: string, message: string): Promise<boolean> {
    // For now, use window.confirm. In the future, this could be a custom modal signal.
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
}
