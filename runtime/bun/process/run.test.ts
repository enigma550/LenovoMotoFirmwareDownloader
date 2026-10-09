import { describe, expect, test } from 'bun:test';
import { runBufferedCommand, runCheckedBufferedCommand } from './run.ts';

describe('runBufferedCommand', () => {
  test('captures stdout and exit code', async () => {
    const result = await runBufferedCommand({
      command: 'echo',
      args: ['hello'],
      envMode: 'external-command',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdoutText.trim()).toBe('hello');
    expect(result.timedOut).toBe(false);
  });

  test('reports non-zero exit codes without throwing', async () => {
    const result = await runBufferedCommand({
      command: 'bash',
      args: ['-c', 'echo boom >&2; exit 3'],
      envMode: 'external-command',
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderrText).toContain('boom');
  });

  test('times out long-running commands', async () => {
    const result = await runBufferedCommand({
      command: 'sleep',
      args: ['5'],
      envMode: 'external-command',
      timeoutMs: 100,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  test('kills the process on abort', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const result = await runBufferedCommand({
      command: 'sleep',
      args: ['5'],
      envMode: 'external-command',
      signal: controller.signal,
    });
    expect(result.exitCode).not.toBe(0);
  });
});

describe('runCheckedBufferedCommand', () => {
  test('returns output on success', async () => {
    const result = await runCheckedBufferedCommand({
      command: 'echo',
      args: ['ok'],
      envMode: 'external-command',
    });
    expect(result.stdoutText.trim()).toBe('ok');
  });

  test('throws with stderr detail on failure', async () => {
    await expect(
      runCheckedBufferedCommand({
        command: 'bash',
        args: ['-c', 'echo bad >&2; exit 2'],
        envMode: 'external-command',
      }),
    ).rejects.toThrow('bad');
  });

  test('honors allowExitCodes', async () => {
    const result = await runCheckedBufferedCommand({
      command: 'bash',
      args: ['-c', 'exit 7'],
      envMode: 'external-command',
      allowExitCodes: [0, 7],
    });
    expect(result.stdoutText).toBe('');
  });

  test('reports the spawned process and clears it afterwards', async () => {
    const seen: Array<Bun.Subprocess | null> = [];
    await runCheckedBufferedCommand({
      command: 'echo',
      args: ['tracked'],
      envMode: 'external-command',
      onProcess: (process) => seen.push(process),
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBeNull();
    expect(seen[1]).toBeNull();
  });

  test('throws AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCheckedBufferedCommand({
        command: 'echo',
        args: ['never'],
        envMode: 'external-command',
        signal: controller.signal,
      }),
    ).rejects.toThrow('aborted');
  });
});
