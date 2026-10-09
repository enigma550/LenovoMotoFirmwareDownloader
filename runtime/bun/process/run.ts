import { createRuntimeProcessEnv, type RuntimeProcessEnvMode } from './env.ts';

export type RuntimeCommandResult = {
  error?: string;
  exitCode: number;
  stderrText: string;
  stdoutText: string;
  timedOut: boolean;
};

type RunBufferedCommandOptions = {
  args?: string[];
  command: string;
  cwd?: string;
  envMode?: RuntimeProcessEnvMode;
  envOverrides?: Record<string, string | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type SpawnDetachedCommandOptions = {
  args?: string[];
  command: string;
  cwd?: string;
  envMode?: RuntimeProcessEnvMode;
  envOverrides?: Record<string, string | undefined>;
};

type LaunchDetachedCommandResult = {
  error?: string;
  exitCode?: number;
  started: boolean;
};

type LaunchDetachedCommandOptions = SpawnDetachedCommandOptions & {
  settleMs?: number;
};

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function createTimeoutError(command: string, timeoutMs: number): Error {
  const error = new Error(`${command} timed out after ${timeoutMs}ms.`);
  error.name = 'TimeoutError';
  return error;
}

async function readStreamText(stream: ReadableStream<Uint8Array> | number | undefined) {
  if (!stream || typeof stream === 'number') {
    return '';
  }
  return new Response(stream).text();
}

/**
 * Shared buffered-command engine used by both runBufferedCommand (result
 * object) and runCheckedBufferedCommand (throws on unexpected exit codes).
 */
async function runBufferedCommandInternal(
  options: RunBufferedCommandOptions & { onSpawned?: (process: Bun.Subprocess) => void },
): Promise<
  RuntimeCommandResult & {
    aborted: boolean;
    process: Bun.Subprocess | null;
  }
> {
  let timedOut = false;
  let aborted = false;
  let childProcess: Bun.Subprocess;

  try {
    childProcess = Bun.spawn([options.command, ...(options.args ?? [])], {
      cwd: options.cwd ?? process.cwd(),
      env: createRuntimeProcessEnv({
        mode: options.envMode,
        overrides: options.envOverrides,
      }),
      stderr: 'pipe',
      stdout: 'pipe',
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      stderrText: '',
      stdoutText: '',
      timedOut,
      aborted: false,
      process: null,
    };
  }

  options.onSpawned?.(childProcess);

  const timeout =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          try {
            childProcess.kill();
          } catch {
            // Ignore kill races.
          }
        }, options.timeoutMs)
      : null;

  const abortListener =
    options.signal &&
    (() => {
      aborted = true;
      try {
        childProcess.kill();
      } catch {
        // Ignore kill races.
      }
    });

  if (abortListener) {
    options.signal?.addEventListener('abort', abortListener, { once: true });
  }

  try {
    const [stdoutText, stderrText, exitCode] = await Promise.all([
      readStreamText(childProcess.stdout),
      readStreamText(childProcess.stderr),
      childProcess.exited,
    ]);

    return {
      error: timedOut ? `${options.command} command timed out.` : undefined,
      exitCode,
      stderrText,
      stdoutText,
      timedOut,
      aborted,
      process: childProcess,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      stderrText: '',
      stdoutText: '',
      timedOut,
      aborted,
      process: childProcess,
    };
  } finally {
    if (abortListener) {
      options.signal?.removeEventListener('abort', abortListener);
    }
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function runBufferedCommand(
  options: RunBufferedCommandOptions,
): Promise<RuntimeCommandResult> {
  const result = await runBufferedCommandInternal(options);
  return {
    error: result.error,
    exitCode: result.exitCode,
    stderrText: result.stderrText,
    stdoutText: result.stdoutText,
    timedOut: result.timedOut,
  };
}

export async function runCheckedBufferedCommand(
  options: RunBufferedCommandOptions & {
    allowExitCodes?: number[];
    onProcess?: (process: Bun.Subprocess | null) => void;
  },
): Promise<{ stderrText: string; stdoutText: string }> {
  if (options.signal?.aborted) {
    throw createAbortError('Operation aborted.');
  }

  try {
    const result = await runBufferedCommandInternal({
      ...options,
      onSpawned: options.onProcess,
    });

    if (options.signal?.aborted || result.aborted) {
      throw createAbortError('Operation aborted.');
    }

    if (result.timedOut && options.timeoutMs) {
      throw createTimeoutError(options.command, options.timeoutMs);
    }

    const allowExitCodes = options.allowExitCodes ?? [0];
    if (!allowExitCodes.includes(result.exitCode)) {
      const errorOutput = [result.stderrText.trim(), result.stdoutText.trim()]
        .filter(Boolean)
        .join('\n');
      throw new Error(errorOutput || `${options.command} exited with code ${result.exitCode}.`);
    }

    return { stderrText: result.stderrText, stdoutText: result.stdoutText };
  } finally {
    options.onProcess?.(null);
  }
}

export async function spawnDetachedCommand(options: SpawnDetachedCommandOptions): Promise<number> {
  const childProcess = Bun.spawn([options.command, ...(options.args ?? [])], {
    cwd: options.cwd ?? process.cwd(),
    env: createRuntimeProcessEnv({
      mode: options.envMode,
      overrides: options.envOverrides,
    }),
    stderr: 'ignore',
    stdin: 'ignore',
    stdout: 'ignore',
  });
  childProcess.unref();
  return childProcess.exited;
}

export async function launchDetachedCommand(
  options: LaunchDetachedCommandOptions,
): Promise<LaunchDetachedCommandResult> {
  let childProcess: Bun.Subprocess;
  try {
    childProcess = Bun.spawn([options.command, ...(options.args ?? [])], {
      cwd: options.cwd ?? process.cwd(),
      env: createRuntimeProcessEnv({
        mode: options.envMode,
        overrides: options.envOverrides,
      }),
      stderr: 'ignore',
      stdin: 'ignore',
      stdout: 'ignore',
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      started: false,
    };
  }

  childProcess.unref();
  const settleMs = Math.max(0, options.settleMs ?? 1_500);
  if (settleMs === 0) {
    return { started: true };
  }

  const settled = await Promise.race([
    childProcess.exited.then((exitCode) => ({ exitCode, type: 'exit' as const })),
    new Promise<{ type: 'running' }>((resolve) =>
      setTimeout(() => resolve({ type: 'running' }), settleMs),
    ),
  ]);

  if (settled.type === 'running') {
    return { started: true };
  }

  return {
    exitCode: settled.exitCode,
    started: settled.exitCode === 0,
  };
}
