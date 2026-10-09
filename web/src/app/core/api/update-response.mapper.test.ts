import { describe, expect, test } from 'bun:test';
import {
  mapCheckProjectUpdateResponse,
  mapProjectUpdatePreflight,
  mapProjectUpdateProgressMessage,
  mapStartProjectUpdateResponse,
} from './update-response.mapper';

describe('mapProjectUpdatePreflight', () => {
  test('maps a full preflight payload', () => {
    const preflight = mapProjectUpdatePreflight({
      mode: 'source',
      available: true,
      currentBranch: 'main',
      currentCommit: 'abcdef1234',
      remoteUrl: 'https://github.com/example/repo.git',
      behindCount: 3,
      aheadCount: 0,
      upToDate: false,
      diverged: false,
      incomingCommits: [{ sha: 'abc', summary: 'fix', author: 'dev', date: '2026-10-09' }],
      dirtyFiles: ['core/x.ts'],
      credentialStatus: 'ok',
      appVersion: '0.0.4',
      logPath: '/tmp/x.log',
    });
    expect(preflight).not.toBeNull();
    expect(preflight?.mode).toBe('source');
    expect(preflight?.behindCount).toBe(3);
    expect(preflight?.incomingCommits).toHaveLength(1);
    expect(preflight?.dirtyFiles).toEqual(['core/x.ts']);
  });

  test('falls back to safe defaults on garbage input', () => {
    expect(mapProjectUpdatePreflight(null)).toBeNull();
    expect(mapProjectUpdatePreflight('nope')).toBeNull();
    const preflight = mapProjectUpdatePreflight({
      mode: 'weird',
      credentialStatus: 'weird',
      behindCount: 'x',
      incomingCommits: 'x',
      dirtyFiles: 42,
    });
    expect(preflight?.mode).toBe('packaged');
    expect(preflight?.credentialStatus).toBe('unknown');
    expect(preflight?.behindCount).toBe(0);
    expect(preflight?.incomingCommits).toEqual([]);
    expect(preflight?.dirtyFiles).toEqual([]);
  });
});

describe('mapStartProjectUpdateResponse', () => {
  test('maps success responses', () => {
    const response = mapStartProjectUpdateResponse({
      ok: true,
      updateId: 'u-1',
      mode: 'source',
      status: 'completed',
      requiresRestart: true,
      appliedCommit: 'abc',
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe('completed');
    expect(response.requiresRestart).toBe(true);
  });

  test('normalizes invalid status and malformed payloads', () => {
    const response = mapStartProjectUpdateResponse({ ok: true, status: 'banana' });
    expect(response.status).toBe('failed');
    const malformed = mapStartProjectUpdateResponse('oops');
    expect(malformed.ok).toBe(false);
    expect(malformed.code).toBe('UNKNOWN');
  });
});

describe('mapCheckProjectUpdateResponse', () => {
  test('preserves error codes from the enum', () => {
    const response = mapCheckProjectUpdateResponse({ ok: false, code: 'AUTH_FAILED', error: 'x' });
    expect(response.code).toBe('AUTH_FAILED');
    const unknown = mapCheckProjectUpdateResponse({ ok: false, code: 'SOMETHING' });
    expect(unknown.code).toBeUndefined();
  });
});

describe('mapProjectUpdateProgressMessage', () => {
  test('maps valid progress events and rejects junk', () => {
    const message = mapProjectUpdateProgressMessage({
      updateId: 'u-1',
      mode: 'source',
      phase: 'build',
      status: 'running',
      stepIndex: 2,
      stepTotal: 5,
      consoleTone: 'error',
    });
    expect(message?.phase).toBe('build');
    expect(message?.consoleTone).toBe('error');
    expect(mapProjectUpdateProgressMessage(null)).toBeNull();
    const junk = mapProjectUpdateProgressMessage({ phase: 'weird', status: 'weird' });
    expect(junk?.phase).toBe('preflight');
    expect(junk?.status).toBe('running');
  });
});
