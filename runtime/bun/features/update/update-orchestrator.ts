/**
 * Update orchestrator — single entry point for both update modes:
 *   - source checkout: safe git sync + dependency install + frontend rebuild;
 *   - packaged app:    Electrobun release updater (check/download/apply).
 *
 * Emits ProjectUpdateProgressMessage events to the UI and writes a detailed,
 * secret-redacting log for every operation.
 */
import { readFile } from 'node:fs/promises';
import type {
  CancelProjectUpdateResponse,
  CheckProjectUpdateResponse,
  GetProjectUpdateLogResponse,
  ProjectUpdateErrorCode,
  ProjectUpdateProgressMessage,
  StartProjectUpdateResponse,
} from '../../../../core/contracts/desktop/index.ts';
import { getAppInfo } from '../../desktop-integration.ts';
import { runBufferedCommand } from '../../process/run.ts';
import type { UpdateProgressDispatch } from '../../rpc/request-handler-types.ts';
import {
  applyFrameworkUpdate,
  checkFrameworkUpdate,
  downloadFrameworkUpdate,
} from './framework-updater.ts';
import {
  collectGitSyncState,
  executeGitSyncPlan,
  type GitSyncConsoleLine,
  isGitAvailable,
  planGitSync,
  validateGitCredentials,
} from './git-sync.ts';
import { findLatestUpdateLogPath, type UpdateLogger } from './update-logger.ts';
import { detectUpdateMode, type ProjectUpdateMode } from './update-mode.ts';

const MAX_LOG_READ_BYTES = 256 * 1024;

type ActiveUpdate = {
  updateId: string;
  mode: ProjectUpdateMode;
  controller: AbortController;
};

let activeUpdate: ActiveUpdate | null = null;

function newUpdateId() {
  return `update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createProgressEmitter(
  dispatch: UpdateProgressDispatch,
  updateId: string,
  mode: ProjectUpdateMode,
) {
  return (progress: Omit<ProjectUpdateProgressMessage, 'updateId' | 'mode'>) => {
    dispatch({ updateId, mode, ...progress });
  };
}

function emitConsole(
  emit: (progress: Omit<ProjectUpdateProgressMessage, 'updateId' | 'mode'>) => void,
  line: GitSyncConsoleLine,
  phase: ProjectUpdateProgressMessage['phase'],
) {
  emit({
    phase,
    status: 'running',
    consoleLine: line.text,
    consoleTone: line.tone,
  });
}

interface BuildStep {
  args: string[];
  cwd: string;
  command: string;
  label: string;
  failureCode: ProjectUpdateErrorCode;
  phase: ProjectUpdateProgressMessage['phase'];
}

function buildUpdateSteps(repoRoot: string): BuildStep[] {
  return [
    {
      label: 'Installing runtime dependencies...',
      command: 'bun',
      args: ['install', '--frozen-lockfile'],
      cwd: repoRoot,
      phase: 'dependencies',
      failureCode: 'DEPENDENCY_FAILED',
    },
    {
      label: 'Installing web dependencies...',
      command: 'bun',
      args: ['install', '--frozen-lockfile'],
      cwd: `${repoRoot}/web`,
      phase: 'dependencies',
      failureCode: 'DEPENDENCY_FAILED',
    },
    {
      label: 'Rebuilding the web interface...',
      command: 'bun',
      args: ['run', 'web:build'],
      cwd: repoRoot,
      phase: 'build',
      failureCode: 'BUILD_FAILED',
    },
    {
      label: 'Syncing the built interface into the app...',
      command: 'bun',
      args: ['run', 'tooling/build/sync-frontend.ts'],
      cwd: repoRoot,
      phase: 'build',
      failureCode: 'BUILD_FAILED',
    },
  ];
}

function tailConsoleLines(text: string, maxLines = 12): string[] {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-maxLines);
}

export async function checkProjectUpdate(
  logger: UpdateLogger,
): Promise<CheckProjectUpdateResponse> {
  try {
    const detection = await detectUpdateMode();
    logger.info('Detected update mode', detection.mode);

    if (detection.mode === 'packaged') {
      const info = await checkFrameworkUpdate();
      logger.info('Packaged updater check', JSON.stringify(info));
      return {
        ok: true,
        preflight: {
          mode: 'packaged',
          available: info.updateAvailable,
          behindCount: info.updateAvailable ? 1 : 0,
          aheadCount: 0,
          upToDate: !info.updateAvailable,
          diverged: false,
          incomingCommits: [],
          dirtyFiles: [],
          credentialStatus: 'not-applicable',
          appVersion: info.version,
          ...(info.error ? { reason: info.error } : {}),
          logPath: logger.path,
        },
      };
    }

    const repoRoot = detection.repoRoot;
    if (!repoRoot) {
      return {
        ok: false,
        code: 'NOT_A_SOURCE_CHECKOUT',
        error: 'This install is not a source checkout.',
      };
    }

    if (!(await isGitAvailable())) {
      logger.warn('git binary is not available');
      return { ok: false, code: 'GIT_MISSING', error: 'git is not installed or not in PATH.' };
    }

    const credentials = await validateGitCredentials(repoRoot, logger);
    if (!credentials.ok) {
      return {
        ok: false,
        code: credentials.code ?? 'AUTH_FAILED',
        error: credentials.error ?? 'Could not validate git credentials.',
      };
    }

    const collected = await collectGitSyncState(repoRoot, { logger });
    if (!collected.ok) {
      return { ok: false, code: collected.code, error: collected.error };
    }

    const plan = planGitSync(collected.state);
    const appInfo = await getAppInfo();
    const state = collected.state;

    return {
      ok: true,
      preflight: {
        mode: 'source',
        available: true,
        currentBranch: state.branch,
        currentCommit: state.commit,
        remoteUrl: state.remoteUrl,
        behindCount: state.behindCount,
        aheadCount: state.aheadCount,
        upToDate: plan.kind === 'up-to-date',
        diverged: plan.kind === 'diverged',
        incomingCommits: state.incomingCommits,
        dirtyFiles: state.dirtyFiles,
        credentialStatus: credentials.credentialStatus,
        appVersion: appInfo.version,
        logPath: logger.path,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('checkProjectUpdate failed', message);
    return { ok: false, code: 'UNKNOWN', error: message };
  }
}

export async function startProjectUpdate(
  payload: { backupLocalChanges?: boolean } | undefined,
  dispatch: UpdateProgressDispatch,
  logger: UpdateLogger,
): Promise<StartProjectUpdateResponse> {
  const detection = await detectUpdateMode();
  const updateId = newUpdateId();
  const mode = detection.mode;
  const emit = createProgressEmitter(dispatch, updateId, mode);
  const backupLocalChanges = Boolean(payload?.backupLocalChanges);
  logger.info('startProjectUpdate', `mode=${mode} backupLocalChanges=${backupLocalChanges}`);

  if (activeUpdate) {
    return {
      ok: false,
      updateId,
      mode,
      status: 'failed',
      code: 'UPDATE_IN_PROGRESS',
      error: 'Another update is already running.',
      logPath: logger.path,
    };
  }

  const controller = new AbortController();
  activeUpdate = { updateId, mode, controller };
  const signal = controller.signal;

  try {
    if (mode === 'packaged') {
      emit({
        phase: 'preflight',
        status: 'starting',
        stepLabel: 'Checking for a new application release...',
        stepIndex: 1,
        stepTotal: 3,
      });
      const info = await checkFrameworkUpdate();
      if (!info.updateAvailable) {
        emit({ phase: 'done', status: 'completed', stepLabel: 'Already up to date.' });
        return {
          ok: true,
          updateId,
          mode,
          status: 'completed',
          code: 'NOTHING_TO_UPDATE',
          logPath: logger.path,
        };
      }

      emit({
        phase: 'fetch',
        status: 'running',
        stepLabel: `Downloading version ${info.version}...`,
        stepIndex: 2,
        stepTotal: 3,
      });
      await downloadFrameworkUpdate();

      emit({
        phase: 'finalize',
        status: 'running',
        stepLabel: 'Applying update...',
        stepIndex: 3,
        stepTotal: 3,
      });
      await applyFrameworkUpdate(logger);
      emit({ phase: 'done', status: 'completed', stepLabel: 'Update applied.' });
      return {
        ok: true,
        updateId,
        mode,
        status: 'completed',
        requiresRestart: true,
        logPath: logger.path,
      };
    }

    const repoRoot = detection.repoRoot;
    if (!repoRoot) {
      emit({ phase: 'failed', status: 'failed', error: 'Not a source checkout.' });
      return {
        ok: false,
        updateId,
        mode,
        status: 'failed',
        code: 'NOT_A_SOURCE_CHECKOUT',
        error: 'This install is not a source checkout.',
        logPath: logger.path,
      };
    }

    const onConsole = (line: GitSyncConsoleLine) => emitConsole(emit, line, 'fetch');

    emit({
      phase: 'preflight',
      status: 'starting',
      stepLabel: 'Validating git credentials...',
      stepIndex: 1,
      stepTotal: 5,
    });
    const credentials = await validateGitCredentials(repoRoot, logger);
    if (!credentials.ok) {
      emit({
        phase: 'failed',
        status: 'failed',
        error: credentials.error ?? 'Credential check failed.',
      });
      return {
        ok: false,
        updateId,
        mode,
        status: 'failed',
        code: credentials.code ?? 'AUTH_FAILED',
        error: credentials.error ?? 'Credential check failed.',
        logPath: logger.path,
      };
    }

    emit({ phase: 'fetch', status: 'running', stepLabel: 'Fetching remote state...' });
    const collected = await collectGitSyncState(repoRoot, { logger, signal, onConsole });
    if (!collected.ok) {
      emit({ phase: 'failed', status: 'failed', error: collected.error });
      return {
        ok: false,
        updateId,
        mode,
        status: 'failed',
        code: collected.code,
        error: collected.error,
        logPath: logger.path,
      };
    }

    const plan = planGitSync(collected.state);
    if (plan.kind === 'up-to-date') {
      emit({ phase: 'done', status: 'completed', stepLabel: 'Already up to date.' });
      logger.info('Nothing to update', `HEAD=${collected.state.commit}`);
      return {
        ok: true,
        updateId,
        mode,
        status: 'completed',
        code: 'NOTHING_TO_UPDATE',
        appliedCommit: collected.state.commit,
        logPath: logger.path,
      };
    }

    if (plan.kind === 'diverged') {
      const error = 'Local branch diverged from origin/main. Resolve manually and try again.';
      emit({ phase: 'failed', status: 'failed', error });
      logger.warn(
        'Diverged history',
        `ahead=${plan.state.aheadCount} behind=${plan.state.behindCount}`,
      );
      return {
        ok: false,
        updateId,
        mode,
        status: 'failed',
        code: 'DIVERGED',
        error,
        logPath: logger.path,
      };
    }

    if (plan.kind === 'fast-forward' && plan.requiresBackup && !backupLocalChanges) {
      const error =
        'There are local uncommitted changes. Enable "backup local changes" or commit them first.';
      emit({ phase: 'failed', status: 'failed', error });
      logger.warn('Dirty tree without backup opt-in', `${plan.state.dirtyFiles.length} file(s)`);
      return {
        ok: false,
        updateId,
        mode,
        status: 'failed',
        code: 'DIRTY_TREE',
        error,
        logPath: logger.path,
      };
    }

    emit({
      phase: 'sync',
      status: 'running',
      stepLabel: `Applying ${plan.state.behindCount} incoming commit(s)...`,
      stepIndex: 2,
      stepTotal: 5,
    });
    const syncResult = await executeGitSyncPlan(plan, repoRoot, {
      backupLocalChanges,
      logger,
      signal,
      onConsole: (line) => emitConsole(emit, line, 'sync'),
    });

    if (!syncResult.ok) {
      emit({ phase: 'failed', status: 'failed', error: syncResult.error });
      return {
        ok: false,
        updateId,
        mode,
        status: 'failed',
        code: syncResult.code,
        error: syncResult.error,
        stashRef: syncResult.stashRef,
        logPath: logger.path,
      };
    }

    const steps = buildUpdateSteps(repoRoot);
    for (const [index, step] of steps.entries()) {
      if (signal.aborted) {
        throw new DOMException('Update canceled.', 'AbortError');
      }
      emit({
        phase: step.phase,
        status: 'running',
        stepLabel: step.label,
        stepIndex: index + 3,
        stepTotal: steps.length + 2,
      });
      logger.info(step.label, `${step.command} ${step.args.join(' ')}`);

      const result = await runBufferedCommand({
        command: step.command,
        args: step.args,
        cwd: step.cwd,
        envMode: 'external-command',
        signal,
        timeoutMs: 15 * 60 * 1000,
      });
      logger.command(step.command, step.args, result.exitCode);

      if (result.exitCode !== 0) {
        const detail = [result.stderrText, result.stdoutText].filter(Boolean).join('\n');
        for (const line of tailConsoleLines(detail)) {
          emit({ phase: step.phase, status: 'running', consoleLine: line, consoleTone: 'error' });
        }
        const error = `${step.label} failed (exit ${result.exitCode}).`;
        emit({ phase: 'failed', status: 'failed', error });
        logger.error(error, tailConsoleLines(detail).join(' | '));
        return {
          ok: false,
          updateId,
          mode,
          status: 'failed',
          code: step.failureCode,
          error,
          stashRef: syncResult.stashRef,
          logPath: logger.path,
        };
      }

      for (const line of tailConsoleLines(result.stdoutText, 3)) {
        emit({ phase: step.phase, status: 'running', consoleLine: line, consoleTone: 'info' });
      }
    }

    emit({
      phase: 'done',
      status: 'completed',
      stepLabel: 'Update complete. Restart the app to use the new version.',
      stepIndex: steps.length + 3,
      stepTotal: steps.length + 3,
    });
    logger.info('Update completed', `appliedCommit=${syncResult.appliedCommit}`);
    return {
      ok: true,
      updateId,
      mode,
      status: 'completed',
      requiresRestart: true,
      appliedCommit: syncResult.appliedCommit,
      stashRef: syncResult.stashRef,
      logPath: logger.path,
    };
  } catch (error) {
    const canceled = signal.aborted || (error instanceof Error && error.name === 'AbortError');
    const message = error instanceof Error ? error.message : String(error);
    emit({
      phase: canceled ? 'canceled' : 'failed',
      status: canceled ? 'canceled' : 'failed',
      error: canceled ? 'Update canceled.' : message,
    });
    logger.log(
      canceled ? 'WARN' : 'ERROR',
      canceled ? 'Update canceled' : 'Update failed',
      message,
    );
    return {
      ok: false,
      updateId,
      mode,
      status: canceled ? 'canceled' : 'failed',
      code: canceled ? 'CANCELED' : 'UNKNOWN',
      error: canceled ? 'Update canceled.' : message,
      logPath: logger.path,
    };
  } finally {
    activeUpdate = null;
  }
}

export function cancelProjectUpdate(): CancelProjectUpdateResponse {
  if (!activeUpdate) {
    return { ok: false, error: 'No update is running.' };
  }
  activeUpdate.controller.abort();
  return { ok: true };
}

export async function getProjectUpdateLog(): Promise<GetProjectUpdateLogResponse> {
  const logPath = findLatestUpdateLogPath();
  if (!logPath) {
    return { ok: false, error: 'No update logs found yet.' };
  }
  try {
    const file = Bun.file(logPath);
    const size = file.size;
    const content =
      size > MAX_LOG_READ_BYTES
        ? await file.slice(size - MAX_LOG_READ_BYTES).text()
        : await readFile(logPath, 'utf8');
    return { ok: true, logPath, content };
  } catch (error) {
    return {
      ok: false,
      logPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
