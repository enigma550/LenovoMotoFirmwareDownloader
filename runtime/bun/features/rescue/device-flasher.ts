import { runCheckedBufferedCommand } from '../../process/index.ts';

export async function runCommandWithAbort(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}) {
  return runCheckedBufferedCommand({
    args: options.args,
    command: options.command,
    cwd: options.cwd,
    envMode: 'external-command',
    onProcess: options.onProcess,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
}

function isCommandNotFoundError<ErrorValue>(error: ErrorValue) {
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
