/**
 * Accessible confirmation dialog state — replaces window.confirm with a
 * promise-based modal rendered by ConfirmDialogComponent.
 */
import { Injectable, signal } from '@angular/core';

interface ConfirmRequest {
  title: string;
  message: string;
  resolve: (accepted: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly pending = signal<ConfirmRequest | null>(null);

  confirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pending.set({ title, message, resolve });
    });
  }

  accept() {
    const request = this.pending();
    if (!request) {
      return;
    }
    this.pending.set(null);
    request.resolve(true);
  }

  decline() {
    const request = this.pending();
    if (!request) {
      return;
    }
    this.pending.set(null);
    request.resolve(false);
  }
}
