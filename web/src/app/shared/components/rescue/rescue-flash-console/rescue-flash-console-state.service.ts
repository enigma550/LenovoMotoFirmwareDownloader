import { Injectable } from '@angular/core';

const MAX_PERSISTED_LINES = 500;
export type RescueFlashConsoleScope = 'firmware' | 'backup';
type RescueFlashConsolePersistedState = {
  lines: string[];
  activeDownloadId: string;
  lastLogSignature: string;
  lastWorkflowStatus: string;
  hasContent: boolean;
};

function createState(): RescueFlashConsolePersistedState {
  return {
    lines: [],
    activeDownloadId: '',
    lastLogSignature: '',
    lastWorkflowStatus: '',
    hasContent: false,
  };
}

/**
 * Singleton service that persists console lines and dedup state
 * across component destroy/recreate cycles (e.g. tab switches).
 */
@Injectable({ providedIn: 'root' })
export class RescueFlashConsoleStateService {
  private readonly states = new Map<RescueFlashConsoleScope, RescueFlashConsolePersistedState>();

  stateFor(scope: RescueFlashConsoleScope) {
    const existing = this.states.get(scope);
    if (existing) {
      return existing;
    }
    const created = createState();
    this.states.set(scope, created);
    return created;
  }

  pushLine(scope: RescueFlashConsoleScope, formatted: string) {
    const state = this.stateFor(scope);
    state.lines.push(formatted);
    if (state.lines.length > MAX_PERSISTED_LINES) {
      state.lines = state.lines.slice(state.lines.length - MAX_PERSISTED_LINES);
    }
    state.hasContent = state.lines.length > 0;
  }

  clear(scope: RescueFlashConsoleScope) {
    this.states.set(scope, createState());
  }
}
