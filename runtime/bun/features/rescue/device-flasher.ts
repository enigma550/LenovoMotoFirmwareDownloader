export async function runCommandWithAbort(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}) {
  const proc = Bun.spawn([options.command, ...options.args], {
    cwd: options.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      ['LD_PRELOAD']: '',
    },
  });
  options.onProcess(proc);
  const hasTimeout = typeof options.timeoutMs === 'number' && options.timeoutMs > 0;
  const effectiveTimeoutMs = hasTimeout ? options.timeoutMs : null;
  let timedOut = false;
  const timeoutTimer =
    effectiveTimeoutMs === null
      ? null
      : setTimeout(() => {
          timedOut = true;
          try {
            proc.kill();
          } catch {
            // Ignore kill race conditions.
          }
        }, effectiveTimeoutMs);

  const abortListener = () => {
    try {
      proc.kill();
    } catch {
      // Ignore kill race conditions.
    }
  };
  options.signal.addEventListener('abort', abortListener, { once: true });

  try {
    const [stdoutText, stderrText, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (options.signal.aborted) {
      const abortError = new Error('Operation aborted.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    if (timedOut && effectiveTimeoutMs !== null) {
      const timeoutError = new Error(`${options.command} timed out after ${effectiveTimeoutMs}ms.`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }

    if (exitCode !== 0) {
      const errorOutput = [stderrText.trim(), stdoutText.trim()].filter(Boolean).join('\n');
      throw new Error(errorOutput || `${options.command} exited with code ${exitCode}.`);
    }

    return {
      stdoutText,
      stderrText,
    };
  } finally {
    options.signal.removeEventListener('abort', abortListener);
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer);
    }
    options.onProcess(null);
  }
}

function isCommandNotFoundError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('enoent') ||
    message.includes('not found') ||
    message.includes('no such file or directory')
  );
}

export async function isCommandAvailable(options: {
  command: string;
  args?: string[];
  cwd: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}) {
  try {
    await runCommandWithAbort({
      command: options.command,
      args: options.args || ['--help'],
      cwd: options.cwd,
      signal: options.signal,
      onProcess: options.onProcess,
    });
    return true;
  } catch (error) {
    if (isCommandNotFoundError(error)) {
      return false;
    }
    // Non-zero exits for --help/--version still mean command exists.
    return true;
  }
}

export type EdlUsbProbeResult = {
  detected: boolean | null;
  detail: string;
};

export async function probeQualcommEdlUsb(options: {
  cwd: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}): Promise<EdlUsbProbeResult> {
  if (process.platform !== 'linux') {
    return {
      detected: null,
      detail: 'EDL USB probe skipped (non-Linux host).',
    };
  }

  try {
    const result = await runCommandWithAbort({
      command: 'lsusb',
      args: [],
      cwd: options.cwd,
      signal: options.signal,
      onProcess: options.onProcess,
    });
    const output = `${result.stdoutText}\n${result.stderrText}`;
    const detected = /05c6:9008/i.test(output);
    return {
      detected,
      detail: detected
        ? 'Detected Qualcomm EDL device (USB 05c6:9008).'
        : 'No Qualcomm EDL USB device (05c6:9008) detected.',
    };
  } catch (error) {
    if (isCommandNotFoundError(error)) {
      return {
        detected: null,
        detail: 'EDL USB probe skipped (`lsusb` not available).',
      };
    }
    return {
      detected: null,
      detail: 'EDL USB probe skipped (lsusb probe failed).',
    };
  }
}

export async function hasFastbootDevice(
  signal: AbortSignal,
  cwd: string,
  setProcess: (process: Bun.Subprocess | null) => void,
) {
  try {
    const result = await runCommandWithAbort({
      command: 'fastboot',
      args: ['devices'],
      cwd,
      signal,
      onProcess: setProcess,
    });
    const output = `${result.stdoutText}\n${result.stderrText}`;
    return /\S+\s+fastboot/i.test(output);
  } catch {
    return false;
  }
}

export async function tryAdbRebootBootloader(
  signal: AbortSignal,
  cwd: string,
  setProcess: (process: Bun.Subprocess | null) => void,
) {
  try {
    const state = await runCommandWithAbort({
      command: 'adb',
      args: ['get-state'],
      cwd,
      signal,
      onProcess: setProcess,
    });
    const output = `${state.stdoutText}\n${state.stderrText}`.toLowerCase();
    if (!output.includes('device')) {
      return false;
    }

    await runCommandWithAbort({
      command: 'adb',
      args: ['reboot', 'bootloader'],
      cwd,
      signal,
      onProcess: setProcess,
    });
    return true;
  } catch {
    return false;
  }
}

export async function tryAdbRebootEdl(
  signal: AbortSignal,
  cwd: string,
  setProcess: (process: Bun.Subprocess | null) => void,
) {
  try {
    const state = await runCommandWithAbort({
      command: 'adb',
      args: ['get-state'],
      cwd,
      signal,
      onProcess: setProcess,
    });
    const output = `${state.stdoutText}\n${state.stderrText}`.toLowerCase();
    if (!output.includes('device')) {
      return false;
    }

    await runCommandWithAbort({
      command: 'adb',
      args: ['reboot', 'edl'],
      cwd,
      signal,
      onProcess: setProcess,
    });
    return true;
  } catch {
    return false;
  }
}
