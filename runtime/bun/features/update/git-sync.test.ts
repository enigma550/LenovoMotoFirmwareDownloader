import { describe, expect, test } from 'bun:test';
import {
  collectGitSyncState,
  executeGitSyncPlan,
  type GitSyncState,
  parseDirtyFiles,
  planGitSync,
} from './git-sync.ts';

function makeState(overrides: Partial<GitSyncState> = {}): GitSyncState {
  return {
    branch: 'main',
    commit: 'abc1234',
    remoteUrl: 'https://github.com/example/repo.git',
    dirtyFiles: [],
    behindCount: 0,
    aheadCount: 0,
    incomingCommits: [],
    ...overrides,
  };
}

describe('planGitSync', () => {
  test('reports up to date when nothing is behind', () => {
    const plan = planGitSync(makeState());
    expect(plan.kind).toBe('up-to-date');
  });

  test('reports up to date when the local branch is ahead', () => {
    const plan = planGitSync(makeState({ aheadCount: 2 }));
    expect(plan.kind).toBe('up-to-date');
  });

  test('plans a fast-forward when behind a clean tree', () => {
    const plan = planGitSync(makeState({ behindCount: 3 }));
    expect(plan.kind).toBe('fast-forward');
    if (plan.kind === 'fast-forward') {
      expect(plan.requiresBackup).toBe(false);
    }
  });

  test('fast-forward on a dirty tree requires a backup', () => {
    const plan = planGitSync(makeState({ behindCount: 1, dirtyFiles: ['core/x.ts'] }));
    expect(plan.kind).toBe('fast-forward');
    if (plan.kind === 'fast-forward') {
      expect(plan.requiresBackup).toBe(true);
    }
  });

  test('reports diverged when both ahead and behind', () => {
    const plan = planGitSync(makeState({ aheadCount: 1, behindCount: 1 }));
    expect(plan.kind).toBe('diverged');
  });
});

describe('executeGitSyncPlan safety gates', () => {
  test('refuses to touch a dirty tree without backup opt-in', async () => {
    const plan = planGitSync(makeState({ behindCount: 1, dirtyFiles: ['a.ts'] }));
    const result = await executeGitSyncPlan(plan, '/nonexistent', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DIRTY_TREE');
    }
  });

  test('refuses to merge a diverged history', async () => {
    const plan = planGitSync(makeState({ aheadCount: 1, behindCount: 2 }));
    const result = await executeGitSyncPlan(plan, '/nonexistent', { backupLocalChanges: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DIVERGED');
    }
  });

  test('short-circuits an up-to-date plan without running git', async () => {
    const plan = planGitSync(makeState());
    const result = await executeGitSyncPlan(plan, '/nonexistent');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appliedCommit).toBe('abc1234');
    }
  });
});

describe('parseDirtyFiles', () => {
  test('keeps full paths from porcelain output', () => {
    const output = ' M core/contracts/desktop/client.ts\n?? web/src/app/features/update/\n';
    expect(parseDirtyFiles(output)).toEqual([
      'core/contracts/desktop/client.ts',
      'web/src/app/features/update/',
    ]);
  });

  test('reports the new path for renames and tolerates CRLF', () => {
    const output = 'R  old/name.ts -> new/name.ts\r\n M other.ts\r\n';
    expect(parseDirtyFiles(output)).toEqual(['new/name.ts', 'other.ts']);
  });
});

describe('collectGitSyncState', () => {
  test('fails cleanly when the directory is not a git repository', async () => {
    const result = await collectGitSyncState('/nonexistent-repo-dir');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['MISSING_REMOTE', 'NETWORK_FAILED', 'AUTH_FAILED', 'UNKNOWN']).toContain(result.code);
    }
  });
});
