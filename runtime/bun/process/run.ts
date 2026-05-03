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

export async function runBufferedCommand(
  options: RunBufferedCommandOptions,
): Promise<RuntimeCommandResult> {
  let timedOut = false;
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
    };
  }

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
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      stderrText: '',
      stdoutText: '',
      timedOut,
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

export async function runCheckedBufferedCommand(
  options: RunBufferedCommandOptions & {
    allowExitCodes?: number[];
    onProcess?: (process: Bun.Subprocess | null) => void;
  },
): Promise<{ stderrText: string; stdoutText: string }> {
  if (options.signal?.aborted) {
    throw createAbortError('Operation aborted.');
  }

  let timedOut = false;
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
    throw error instanceof Error ? error : new Error(String(error));
  }

  options.onProcess?.(childProcess);

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

    if (options.signal?.aborted) {
      throw createAbortError('Operation aborted.');
    }

    if (timedOut && options.timeoutMs) {
      throw createTimeoutError(options.command, options.timeoutMs);
    }

    const allowExitCodes = options.allowExitCodes ?? [0];
    if (!allowExitCodes.includes(exitCode)) {
      const errorOutput = [stderrText.trim(), stdoutText.trim()].filter(Boolean).join('\n');
      throw new Error(errorOutput || `${options.command} exited with code ${exitCode}.`);
    }

    return { stderrText, stdoutText };
  } finally {
    if (abortListener) {
      options.signal?.removeEventListener('abort', abortListener);
    }
    if (timeout) {
      clearTimeout(timeout);
    }
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
