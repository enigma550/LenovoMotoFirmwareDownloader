/**
 * Git sync engine — safe synchronization of a source checkout with the main
 * branch of the remote repository.
 *
 * Safety rules (validated before touching anything):
 *   - credentials are verified up-front via `git ls-remote`;
 *   - dirty working trees are never modified silently (stash backup opt-in);
 *   - diverged histories abort with instructions instead of forcing merges;
 *   - only fast-forward merges are executed.
 */
import type {
  ProjectUpdateCommit,
  ProjectUpdateCredentialStatus,
} from '../../../../core/contracts/desktop/entries.ts';
import { runBufferedCommand } from '../../process/run.ts';
import type { UpdateLogger } from './update-logger.ts';

export const GIT_REMOTE_NAME = 'origin';
export const GIT_MAIN_BRANCH = 'main';

const CREDENTIAL_CHECK_TIMEOUT_MS = 15_000;
const GIT_COMMAND_TIMEOUT_MS = 120_000;

export type GitSyncErrorCode =
  | 'GIT_MISSING'
  | 'NOT_A_SOURCE_CHECKOUT'
  | 'MISSING_REMOTE'
  | 'AUTH_FAILED'
  | 'NETWORK_FAILED'
  | 'MERGE_FAILED'
  | 'DIRTY_TREE'
  | 'DIVERGED'
  | 'CANCELED'
  | 'UNKNOWN';

export interface GitSyncConsoleLine {
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface GitSyncState {
  branch: string;
  commit: string;
  remoteUrl: string;
  dirtyFiles: string[];
  behindCount: number;
  aheadCount: number;
  incomingCommits: ProjectUpdateCommit[];
}

export type GitSyncPlan =
  | { kind: 'up-to-date'; state: GitSyncState }
  | { kind: 'dirty-tree'; state: GitSyncState }
  | { kind: 'diverged'; state: GitSyncState }
  | { kind: 'fast-forward'; state: GitSyncState; requiresBackup: boolean };

export type GitSyncRunResult =
  | { ok: true; appliedCommit: string; stashRef?: string }
  | { ok: false; code: GitSyncErrorCode; error: string; stashRef?: string };

interface GitCommandOutcome {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
  error?: string;
}

async function runGit(
  repoRoot: string,
  args: string[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<GitCommandOutcome> {
  const result = await runBufferedCommand({
    command: 'git',
    args,
    cwd: repoRoot,
    envMode: 'external-command',
    timeoutMs: options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS,
    signal: options.signal,
  });
  return {
    exitCode: result.exitCode,
    stdoutText: result.stdoutText,
    stderrText: result.stderrText,
    error: result.error,
  };
}

export async function isGitAvailable(): Promise<boolean> {
  const result = await runBufferedCommand({
    command: 'git',
    args: ['--version'],
    envMode: 'external-command',
    timeoutMs: 10_000,
  });
  return result.exitCode === 0;
}

function classifyGitFailure(outcome: GitCommandOutcome): {
  code: GitSyncErrorCode;
  credentialStatus: ProjectUpdateCredentialStatus;
  error: string;
} {
  const detail = [outcome.stderrText, outcome.stdoutText, outcome.error]
    .filter(Boolean)
    .join('\n')
    .trim();
  const lower = detail.toLowerCase();

  if (
    lower.includes('authentication failed') ||
    lower.includes('permission denied') ||
    lower.includes('could not read username') ||
    lower.includes('could not read password') ||
    lower.includes('403') ||
    lower.includes('401') ||
    lower.includes('invalid username or password')
  ) {
    return {
      code: 'AUTH_FAILED',
      credentialStatus: 'auth-failed',
      error: 'Git credentials were rejected by the remote repository.',
    };
  }

  if (
    lower.includes('could not resolve host') ||
    lower.includes('unable to access') ||
    lower.includes('connection refused') ||
    lower.includes('timed out') ||
    lower.includes('network is unreachable') ||
    outcome.error?.includes('timed out')
  ) {
    return {
      code: 'NETWORK_FAILED',
      credentialStatus: 'network-failed',
      error: 'Could not reach the remote repository (network problem).',
    };
  }

  if (
    lower.includes('does not appear to be a git repository') ||
    lower.includes('no such remote') ||
    lower.includes("'origin' does not appear") ||
    lower.includes('repository not found')
  ) {
    return {
      code: 'MISSING_REMOTE',
      credentialStatus: 'missing-remote',
      error: `Remote "${GIT_REMOTE_NAME}" is missing or unknown.`,
    };
  }

  return {
    code: 'UNKNOWN',
    credentialStatus: 'unknown',
    error: detail || `git exited with code ${outcome.exitCode}.`,
  };
}

export interface GitCredentialsCheck {
  ok: boolean;
  credentialStatus: ProjectUpdateCredentialStatus;
  code?: GitSyncErrorCode;
  error?: string;
}

/** Validates remote access (and therefore stored git credentials) before syncing. */
export async function validateGitCredentials(
  repoRoot: string,
  logger?: UpdateLogger,
): Promise<GitCredentialsCheck> {
  const outcome = await runGit(
    repoRoot,
    ['ls-remote', '--heads', GIT_REMOTE_NAME, GIT_MAIN_BRANCH],
    { timeoutMs: CREDENTIAL_CHECK_TIMEOUT_MS },
  );
  logger?.command(
    'git',
    ['ls-remote', '--heads', GIT_REMOTE_NAME, GIT_MAIN_BRANCH],
    outcome.exitCode,
  );

  if (outcome.exitCode === 0) {
    return { ok: true, credentialStatus: 'ok' };
  }
  const classified = classifyGitFailure(outcome);
  logger?.warn('Credential check failed', classified.error);
  return {
    ok: false,
    credentialStatus: classified.credentialStatus,
    code: classified.code,
    error: classified.error,
  };
}

function parseIncomingCommits(stdout: string): ProjectUpdateCommit[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha = '', summary = '', author = '', date = ''] = line.split('\t');
      return { sha, summary, author, date };
    });
}

/** Parses `git status --porcelain` output into file paths. Pure. */
export function parseDirtyFiles(statusOutput: string): string[] {
  return statusOutput
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const pathPart = line.slice(3).trim();
      const arrowIndex = pathPart.indexOf(' -> ');
      return arrowIndex >= 0 ? pathPart.slice(arrowIndex + 4).trim() : pathPart;
    })
    .filter(Boolean);
}

export async function collectGitSyncState(
  repoRoot: string,
  options: {
    logger?: UpdateLogger;
    signal?: AbortSignal;
    onConsole?: (line: GitSyncConsoleLine) => void;
  } = {},
): Promise<
  { ok: true; state: GitSyncState } | { ok: false; code: GitSyncErrorCode; error: string }
> {
  const { logger, signal, onConsole } = options;

  const fetchOutcome = await runGit(repoRoot, ['fetch', GIT_REMOTE_NAME, GIT_MAIN_BRANCH], {
    signal,
  });
  logger?.command('git', ['fetch', GIT_REMOTE_NAME, GIT_MAIN_BRANCH], fetchOutcome.exitCode);
  if (fetchOutcome.exitCode !== 0) {
    const classified = classifyGitFailure(fetchOutcome);
    onConsole?.({ text: classified.error, tone: 'error' });
    return { ok: false, code: classified.code, error: classified.error };
  }

  const [branchOutcome, commitOutcome, remoteOutcome, statusOutcome, countOutcome, logOutcome] =
    await Promise.all([
      runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { signal }),
      runGit(repoRoot, ['rev-parse', 'HEAD'], { signal }),
      runGit(repoRoot, ['remote', 'get-url', GIT_REMOTE_NAME], { signal }),
      runGit(repoRoot, ['status', '--porcelain'], { signal }),
      runGit(
        repoRoot,
        ['rev-list', '--left-right', '--count', `HEAD...${GIT_REMOTE_NAME}/${GIT_MAIN_BRANCH}`],
        {
          signal,
        },
      ),
      runGit(
        repoRoot,
        [
          'log',
          '--pretty=format:%h\t%s\t%an\t%ad',
          '--date=short',
          '-20',
          `HEAD..${GIT_REMOTE_NAME}/${GIT_MAIN_BRANCH}`,
        ],
        { signal },
      ),
    ]);

  if (
    branchOutcome.exitCode !== 0 ||
    commitOutcome.exitCode !== 0 ||
    remoteOutcome.exitCode !== 0 ||
    countOutcome.exitCode !== 0
  ) {
    const error = [branchOutcome, commitOutcome, remoteOutcome, countOutcome]
      .map((outcome) => outcome.stderrText.trim())
      .filter(Boolean)
      .join('\n');
    return { ok: false, code: 'UNKNOWN', error: error || 'Could not read git repository state.' };
  }

  const [aheadRaw = '0', behindRaw = '0'] = countOutcome.stdoutText.trim().split('\t');
  const aheadCount = Number.parseInt(aheadRaw, 10) || 0;
  const behindCount = Number.parseInt(behindRaw, 10) || 0;
  const dirtyFiles = parseDirtyFiles(statusOutcome.stdoutText);

  return {
    ok: true,
    state: {
      branch: branchOutcome.stdoutText.trim(),
      commit: commitOutcome.stdoutText.trim(),
      remoteUrl: remoteOutcome.stdoutText.trim(),
      dirtyFiles,
      aheadCount,
      behindCount,
      incomingCommits: parseIncomingCommits(logOutcome.stdoutText),
    },
  };
}

/** Pure decision function — no I/O, fully unit-testable. */
export function planGitSync(state: GitSyncState): GitSyncPlan {
  if (state.aheadCount > 0 && state.behindCount > 0) {
    return { kind: 'diverged', state };
  }
  if (state.behindCount === 0) {
    return { kind: 'up-to-date', state };
  }
  return {
    kind: 'fast-forward',
    state,
    requiresBackup: state.dirtyFiles.length > 0,
  };
}

export async function executeGitSyncPlan(
  plan: GitSyncPlan,
  repoRoot: string,
  options: {
    backupLocalChanges?: boolean;
    logger?: UpdateLogger;
    signal?: AbortSignal;
    onConsole?: (line: GitSyncConsoleLine) => void;
  } = {},
): Promise<GitSyncRunResult> {
  const { logger, signal, onConsole } = options;

  if (plan.kind === 'up-to-date') {
    return { ok: true, appliedCommit: plan.state.commit };
  }
  if (plan.kind === 'diverged') {
    return {
      ok: false,
      code: 'DIVERGED',
      error:
        'Local branch has commits that the remote does not have. Resolve manually ' +
        '(e.g. rebase or merge origin/main yourself) and try again.',
    };
  }
  if (plan.kind === 'fast-forward' && plan.requiresBackup && !options.backupLocalChanges) {
    return {
      ok: false,
      code: 'DIRTY_TREE',
      error:
        'There are local uncommitted changes. Enable "backup local changes" to stash them ' +
        'safely before updating, or commit/stash them yourself.',
    };
  }

  let stashRef: string | undefined;

  if (plan.kind === 'fast-forward' && plan.requiresBackup) {
    const stashMessage = `lmfd-update-backup ${new Date().toISOString()}`;
    const stashOutcome = await runGit(repoRoot, ['stash', 'push', '-u', '-m', stashMessage], {
      signal,
    });
    logger?.command('git', ['stash', 'push', '-u', '-m', stashMessage], stashOutcome.exitCode);
    if (stashOutcome.exitCode !== 0) {
      const classified = classifyGitFailure(stashOutcome);
      return { ok: false, code: classified.code, error: `Backup failed: ${classified.error}` };
    }

    const stashRefOutcome = await runGit(repoRoot, ['rev-parse', 'refs/stash'], { signal });
    stashRef = stashRefOutcome.stdoutText.trim() || undefined;
    onConsole?.({
      text: `Local changes backed up to stash ${stashRef || '(refs/stash)'}.`,
      tone: 'success',
    });
  }

  const mergeOutcome = await runGit(
    repoRoot,
    ['merge', '--ff-only', `${GIT_REMOTE_NAME}/${GIT_MAIN_BRANCH}`],
    { signal },
  );
  logger?.command(
    'git',
    ['merge', '--ff-only', `${GIT_REMOTE_NAME}/${GIT_MAIN_BRANCH}`],
    mergeOutcome.exitCode,
  );

  if (signal?.aborted) {
    return { ok: false, code: 'CANCELED', error: 'Update canceled.', stashRef };
  }

  if (mergeOutcome.exitCode !== 0) {
    const detail = mergeOutcome.stderrText.trim() || mergeOutcome.stdoutText.trim();
    onConsole?.({ text: `Merge failed: ${detail}`, tone: 'error' });
    return {
      ok: false,
      code: 'MERGE_FAILED',
      error: `Fast-forward merge failed. ${detail}`,
      stashRef,
    };
  }

  const appliedOutcome = await runGit(repoRoot, ['rev-parse', 'HEAD'], { signal });
  const appliedCommit = appliedOutcome.stdoutText.trim() || plan.state.commit;
  onConsole?.({ text: `Updated to ${appliedCommit.slice(0, 10)}.`, tone: 'success' });
  return { ok: true, appliedCommit, stashRef };
}
