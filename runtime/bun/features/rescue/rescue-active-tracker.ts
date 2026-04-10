/**
 * Active rescue operation tracker.
 * Manages the lifecycle of active rescue/flash operations (cancel, process tracking).
 */
import type { DownloadProgressMessage } from '../../../shared/desktop-rpc';

export type RescueProgressEmitter = (progress: DownloadProgressMessage) => void;

export type ActiveRescue = {
  controller: AbortController;
  canceled: boolean;
  activeProcess: Bun.Subprocess | null;
};

export const activeRescues = new Map<string, ActiveRescue>();

export function hasActiveRescue(excludeDownloadId?: string) {
  for (const downloadId of activeRescues.keys()) {
    if (!excludeDownloadId || downloadId !== excludeDownloadId) {
      return true;
    }
  }
  return false;
}

export function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function isAbortError<ErrorValue>(error: ErrorValue) {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message)) return true;
  return false;
}

/**
 * Cancels active rescue operations.
 * If downloadId is provided, cancels only that specific operation.
 * If no downloadId is provided, cancels ALL active rescue operations (used during app updates).
 */
export function cancelActiveRescue(downloadId?: string) {
  if (downloadId) {
    const active = activeRescues.get(downloadId);
    if (!active) return false;

    active.canceled = true;
    active.controller.abort();
    try {
      active.activeProcess?.kill();
    } catch {
      /* ignore */
    }
    return true;
  }

  console.log(`[RescueManager] Canceling ${activeRescues.size} active rescue(s)...`);
  for (const [, rescue] of activeRescues.entries()) {
    try {
      rescue.canceled = true;
      rescue.controller.abort();
      rescue.activeProcess?.kill();
    } catch {
      /* ignore */
    }
  }
  activeRescues.clear();
  return true;
}
