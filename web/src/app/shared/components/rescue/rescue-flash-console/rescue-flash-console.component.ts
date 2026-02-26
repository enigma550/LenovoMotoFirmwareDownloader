import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import type { ITerminalOptions } from '@xterm/xterm';
import { type NgTerminalComponent, NgTerminalModule } from 'ng-terminal';
import type { FirmwareDownloadState } from '../../../../core/state/workflow/workflow.types';
import { UiActionButtonComponent } from '../../ui/ui-action-button/ui-action-button.component';

const TERMINAL_MAX_LINES = 500;
type LogTone = 'info' | 'verbose' | 'success' | 'warning' | 'error';
type BuiltLogLine = { message: string; tone: LogTone } | null;

@Component({
  selector: 'app-rescue-flash-console',
  standalone: true,
  imports: [NgTerminalModule, UiActionButtonComponent],
  templateUrl: './rescue-flash-console.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescueFlashConsoleComponent {
  readonly download = input.required<FirmwareDownloadState>();
  readonly isDark = input(false);
  readonly statusText = input('');
  readonly cancelRequested = output<string>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef<HTMLElement>);

  protected readonly hasConsoleContent = signal(false);
  protected readonly shouldShow = computed(() => {
    const active = this.download();
    const rescueActive = active.mode === 'rescue-lite' && Boolean(active.downloadId);
    return rescueActive || this.hasConsoleContent();
  });
  protected readonly canCancelCurrentAction = computed(() => {
    const current = this.download();
    if (!current.downloadId) {
      return false;
    }

    return (
      current.status === 'starting' ||
      current.status === 'downloading' ||
      current.status === 'paused' ||
      current.status === 'preparing' ||
      current.status === 'flashing'
    );
  });

  private terminal: NgTerminalComponent | null = null;
  private consoleSectionElement: HTMLElement | null = null;
  private lines: string[] = [];
  private activeDownloadId = '';
  private lastLogSignature = '';
  private lastExtractStatus = '';

  private readonly darkTerminalOptions: ITerminalOptions & { theme?: { border?: string } } = {
    convertEol: true,
    disableStdin: true,
    cursorBlink: false,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    theme: {
      background: '#020617',
      foreground: '#e2e8f0',
      border: '#334155',
    },
  };

  private readonly lightTerminalOptions: ITerminalOptions & { theme?: { border?: string } } = {
    convertEol: true,
    disableStdin: true,
    cursorBlink: false,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    theme: {
      background: '#020617',
      foreground: '#f8fafc',
      border: '#cbd5e1',
    },
  };

  constructor() {
    effect(() => {
      const state = this.download();
      this.syncWithDownloadState(state);
    });

    effect(() => {
      const status = this.statusText();
      this.syncWithExtractStatus(status);
    });
  }

  @ViewChild('flashTerminal')
  set flashTerminal(component: NgTerminalComponent | undefined) {
    this.terminal = component ?? null;
    if (!this.terminal) {
      return;
    }

    this.terminal.underlying?.clear();
    for (const line of this.lines) {
      this.terminal.write(`${line}\r\n`);
    }
  }

  @ViewChild('consoleSection')
  set consoleSection(section: ElementRef<HTMLElement> | undefined) {
    this.consoleSectionElement = section?.nativeElement ?? null;
  }

  protected terminalOptions() {
    return this.isDark() ? this.darkTerminalOptions : this.lightTerminalOptions;
  }

  protected clearConsole() {
    this.lines = [];
    this.hasConsoleContent.set(false);
    this.lastLogSignature = '';
    this.terminal?.underlying?.clear();
  }

  protected requestCancelCurrentAction() {
    const current = this.download();
    if (!this.canCancelCurrentAction()) {
      return;
    }

    this.appendLine('Cancel requested by user...', 'warning');
    this.cancelRequested.emit(current.downloadId);
  }

  private syncWithDownloadState(state: FirmwareDownloadState) {
    if (state.mode !== 'rescue-lite' || !state.downloadId) {
      return;
    }

    if (state.downloadId !== this.activeDownloadId) {
      this.activeDownloadId = state.downloadId;
      this.lastLogSignature = '';
      this.lines = [];
      this.terminal?.underlying?.clear();
      const startLabel =
        state.commandSource === 'local-extract'
          ? `Started extraction: ${state.romName}`
          : `Started rescue flash: ${state.romName}`;
      this.appendLine(startLabel, 'info');
    }

    const signature = this.buildSignature(state);
    if (signature === this.lastLogSignature) {
      return;
    }
    this.lastLogSignature = signature;

    const line = this.buildLogLine(state);
    if (line) {
      this.appendLine(line.message, line.tone);
    }
  }

  private buildSignature(state: FirmwareDownloadState) {
    return [
      state.downloadId,
      state.status,
      state.phase || '',
      typeof state.stepIndex === 'number' ? String(state.stepIndex) : '',
      typeof state.stepTotal === 'number' ? String(state.stepTotal) : '',
      state.stepLabel || '',
      state.error || '',
      state.commandSource || '',
    ].join('|');
  }

  private buildLogLine(state: FirmwareDownloadState): BuiltLogLine {
    const stepProgress =
      typeof state.stepIndex === 'number' && typeof state.stepTotal === 'number'
        ? ` [${state.stepIndex}/${state.stepTotal}]`
        : '';
    const stepLabel = (state.stepLabel || '').trim();
    const isLocalExtract = state.commandSource === 'local-extract';

    if (stepLabel.startsWith('[extract]')) {
      return {
        message: stepLabel.replace(/^\[extract\]\s*/i, ''),
        tone: 'verbose',
      };
    }

    if (state.status === 'starting') {
      return { message: `Starting${stepProgress}`, tone: 'info' };
    }

    if (state.status === 'downloading') {
      return { message: 'Downloading package...', tone: 'info' };
    }

    if (state.status === 'preparing') {
      if (stepLabel) {
        const normalized = stepLabel.toLowerCase();
        if (isLocalExtract) {
          return { message: stepLabel, tone: 'info' };
        }
        if (normalized.includes('extract') || normalized.includes('unpack')) {
          return { message: `Extracting: ${stepLabel}`, tone: 'info' };
        }
        return { message: `Preparing: ${stepLabel}`, tone: 'info' };
      }
      return { message: 'Extracting and preparing rescue package...', tone: 'info' };
    }

    if (state.status === 'flashing') {
      if (stepLabel) {
        return { message: `Flashing${stepProgress}: ${stepLabel}`, tone: 'info' };
      }
      return { message: `Flashing${stepProgress}...`, tone: 'info' };
    }

    if (state.status === 'paused') {
      return { message: 'Paused', tone: 'warning' };
    }

    if (state.status === 'completed') {
      if (isLocalExtract) {
        return { message: 'Extraction completed.', tone: 'success' };
      }
      return { message: state.dryRun ? 'Dry run completed.' : 'Flash completed.', tone: 'success' };
    }

    if (state.status === 'failed') {
      return { message: state.error ? `Failed: ${state.error}` : 'Failed.', tone: 'error' };
    }

    if (state.status === 'canceled') {
      return { message: isLocalExtract ? 'Extraction canceled.' : 'Canceled.', tone: 'warning' };
    }

    return null;
  }

  private appendLine(content: string, tone: LogTone = 'info') {
    const timestamp = new Date().toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const formatted = this.formatTerminalLine(timestamp, content, tone);
    this.lines.push(formatted);
    if (this.lines.length > TERMINAL_MAX_LINES) {
      this.lines = this.lines.slice(this.lines.length - TERMINAL_MAX_LINES);
    }
    this.hasConsoleContent.set(this.lines.length > 0);
    this.terminal?.write(`${formatted}\r\n`);
    this.scrollPageToConsoleIfOutOfView();
  }

  private syncWithExtractStatus(statusText: string) {
    const normalized = statusText.trim();
    if (!normalized) {
      return;
    }

    const active = this.download();
    if (active.commandSource === 'local-extract') {
      return;
    }

    if (!this.isExtractStatus(normalized)) {
      return;
    }

    if (normalized === this.lastExtractStatus) {
      return;
    }
    this.lastExtractStatus = normalized;

    this.appendLine(normalized, 'info');
  }

  private isExtractStatus(statusText: string) {
    const normalized = statusText.toLowerCase();
    return (
      normalized.startsWith('extracting ') ||
      normalized.startsWith('extraction ') ||
      normalized.includes('failed to extract')
    );
  }

  private scrollPageToConsoleIfOutOfView() {
    const section = this.consoleSectionElement ?? this.hostRef.nativeElement;
    if (!section) {
      return;
    }

    const rect = section.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    const fullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight;

    if (fullyVisible) {
      return;
    }

    section.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
  }

  private formatTerminalLine(timestamp: string, content: string, tone: LogTone) {
    const reset = '\u001b[0m';
    const timestampColor = this.isDark() ? '\u001b[94m' : '\u001b[96m';
    const toneColor = this.getToneAnsiColor(tone);
    return `${timestampColor}[${timestamp}]${reset} ${toneColor}${content}${reset}`;
  }

  private getToneAnsiColor(tone: LogTone) {
    if (tone === 'success') {
      return '\u001b[92m';
    }

    if (tone === 'warning') {
      return '\u001b[93m';
    }

    if (tone === 'error') {
      return '\u001b[91m';
    }

    if (tone === 'verbose') {
      return this.isDark() ? '\u001b[97m' : '\u001b[37;1m';
    }

    return this.isDark() ? '\u001b[96m' : '\u001b[97m';
  }
}
