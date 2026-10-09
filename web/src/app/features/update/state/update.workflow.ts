/**
 * Update workflow — state and orchestration for the in-app "Update" flow.
 *
 * Single-layer service (no facade pass-through): it owns the dialog state,
 * preflight results, progress console and the update actions themselves.
 */
import { computed, Injectable, inject, signal } from '@angular/core';
import { UpdateDesktopApiService } from '../../../core/api/desktop';
import { mapProjectUpdateProgressMessage } from '../../../core/api/update-response.mapper';
import type {
  ProjectUpdateErrorCode,
  ProjectUpdatePreflight,
  ProjectUpdateProgressMessage,
  ProjectUpdateTone,
} from '../../../core/models/desktop-api';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';

export interface UpdateConsoleEntry {
  id: number;
  text: string;
  tone: ProjectUpdateTone;
}

type DesktopBridgePayload = object | string | number | boolean | null | undefined;

const UPDATE_PROGRESS_EVENT_NAME = 'desktop-update-progress';
const MAX_CONSOLE_ENTRIES = 400;

@Injectable({ providedIn: 'root' })
export class UpdateWorkflowService {
  private readonly backend = inject(UpdateDesktopApiService);
  private readonly ui = inject(WorkflowUiService);

  readonly isOpen = signal(false);
  readonly checking = signal(false);
  readonly running = signal(false);
  readonly canceling = signal(false);
  readonly preflight = signal<ProjectUpdatePreflight | null>(null);
  readonly errorCode = signal<ProjectUpdateErrorCode | null>(null);
  readonly errorMessage = signal('');
  readonly consoleEntries = signal<UpdateConsoleEntry[]>([]);
  readonly progress = signal<ProjectUpdateProgressMessage | null>(null);
  readonly backupLocalChanges = signal(true);
  readonly requiresRestart = signal(false);
  readonly lastLogPath = signal('');
  readonly logContent = signal('');
  readonly showLog = signal(false);

  readonly hasUpdate = computed(() => {
    const preflight = this.preflight();
    return Boolean(preflight?.available && preflight.behindCount > 0 && !preflight.diverged);
  });

  readonly progressPercent = computed(() => {
    const progress = this.progress();
    if (!progress?.stepTotal || !progress.stepIndex) {
      return this.running() ? 5 : 0;
    }
    return Math.min(100, Math.round((progress.stepIndex / progress.stepTotal) * 100));
  });

  private consoleCounter = 0;

  constructor() {
    window.addEventListener(UPDATE_PROGRESS_EVENT_NAME, this.handleProgressEvent as EventListener);
  }

  openDialog() {
    this.isOpen.set(true);
    void this.check();
  }

  closeDialog() {
    if (this.running()) {
      return;
    }
    this.isOpen.set(false);
    this.showLog.set(false);
    this.logContent.set('');
  }

  toggleBackupLocalChanges() {
    this.backupLocalChanges.update((value) => !value);
  }

  async check() {
    if (this.checking() || this.running()) {
      return;
    }
    this.checking.set(true);
    this.errorCode.set(null);
    this.errorMessage.set('');
    try {
      const response = await this.backend.checkProjectUpdate();
      if (response.ok && response.preflight) {
        this.preflight.set(response.preflight);
        if (response.preflight.logPath) {
          this.lastLogPath.set(response.preflight.logPath);
        }
        this.appendConsole(
          response.preflight.upToDate
            ? 'Project is up to date.'
            : `Found ${response.preflight.behindCount} incoming commit(s).`,
          response.preflight.upToDate ? 'success' : 'info',
        );
        return;
      }
      this.errorCode.set(response.code ?? 'UNKNOWN');
      this.errorMessage.set(response.error || 'Could not verify updates.');
    } catch (error) {
      this.errorCode.set('UNKNOWN');
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.checking.set(false);
    }
  }

  async start() {
    if (this.running() || this.checking()) {
      return;
    }
    const preflight = this.preflight();
    if (preflight && (preflight.upToDate || preflight.behindCount === 0)) {
      this.ui.showToast('Project is already up to date.', 'info', 2200);
      return;
    }

    this.running.set(true);
    this.canceling.set(false);
    this.requiresRestart.set(false);
    this.errorCode.set(null);
    this.errorMessage.set('');
    this.progress.set(null);
    this.appendConsole('Starting project update...', 'info');

    try {
      const response = await this.backend.startProjectUpdate({
        backupLocalChanges: this.backupLocalChanges(),
      });

      if (response.logPath) {
        this.lastLogPath.set(response.logPath);
      }

      if (response.ok) {
        this.appendConsole('Update completed successfully.', 'success');
        if (response.stashRef) {
          this.appendConsole(
            `Local changes were backed up (stash ${response.stashRef.slice(0, 10)}).`,
            'info',
          );
        }
        this.requiresRestart.set(response.requiresRestart ?? false);
        this.ui.showToast('Update completed. Restart the app to apply.', 'success', 5200);
        void this.check();
        return;
      }

      this.errorCode.set(response.code ?? 'UNKNOWN');
      this.errorMessage.set(response.error || 'Update failed.');
      this.appendConsole(response.error || 'Update failed.', 'error');
      if (response.code === 'CANCELED') {
        this.ui.showToast('Update canceled.', 'info', 2200);
      } else {
        this.ui.showToast('Update failed. Check the log for details.', 'error', 4200);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errorCode.set('UNKNOWN');
      this.errorMessage.set(message);
      this.appendConsole(message, 'error');
      this.ui.showToast('Update failed. Check the log for details.', 'error', 4200);
    } finally {
      this.running.set(false);
      this.canceling.set(false);
    }
  }

  async cancel() {
    if (!this.running() || this.canceling()) {
      return;
    }
    this.canceling.set(true);
    try {
      await this.backend.cancelProjectUpdate();
    } catch {
      // Best effort — the orchestrator aborts via its own state.
    }
  }

  async toggleLog() {
    if (this.showLog()) {
      this.showLog.set(false);
      return;
    }
    const response = await this.backend.getProjectUpdateLog();
    if (response.ok && response.content) {
      this.logContent.set(response.content);
      if (response.logPath) {
        this.lastLogPath.set(response.logPath);
      }
      this.showLog.set(true);
      return;
    }
    this.ui.showToast(response.error || 'No update logs available.', 'info', 2600);
  }

  private appendConsole(text: string, tone: ProjectUpdateTone) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    this.consoleEntries.update((entries) => {
      const next = [...entries, { id: ++this.consoleCounter, text: trimmed, tone }];
      return next.length > MAX_CONSOLE_ENTRIES ? next.slice(-MAX_CONSOLE_ENTRIES) : next;
    });
  }

  private readonly handleProgressEvent = (event: Event) => {
    const customEvent = event as CustomEvent<DesktopBridgePayload>;
    const payload = mapProjectUpdateProgressMessage(customEvent.detail);
    if (!payload) {
      return;
    }
    this.progress.set(payload);
    if (payload.stepLabel) {
      this.appendConsole(payload.stepLabel, payload.consoleTone ?? 'info');
    }
    if (payload.consoleLine && payload.consoleLine !== payload.stepLabel) {
      this.appendConsole(payload.consoleLine, payload.consoleTone ?? 'info');
    }
  };
}
