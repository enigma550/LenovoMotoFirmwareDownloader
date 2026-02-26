import { basename } from 'node:path';
import {
  getFirmwareArchiveExtension,
  SUPPORTED_FIRMWARE_ARCHIVE_EXTENSIONS,
} from './archive-format.ts';
import type {
  ExtractionAttemptResult,
  RunExtractionStrategyOptions,
} from './extraction-strategy.ts';
import { createExtractionStrategyOrder } from './extraction-strategy-factory.ts';

function createAbortError(message: string) {
  const abortError = new Error(message);
  abortError.name = 'AbortError';
  return abortError;
}

async function readSubprocessStreamWithLogs(
  stream: Bun.Subprocess['stdout'] | Bun.Subprocess['stderr'],
  onLog?: (line: string) => void,
) {
  if (!stream || typeof stream === 'number') {
    return '';
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let collected = '';
  let buffered = '';

  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !onLog) {
      return;
    }
    onLog(trimmed);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    const chunkText = decoder.decode(value, { stream: true });
    if (!chunkText) {
      continue;
    }

    collected += chunkText;
    buffered += chunkText;

    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || '';
    for (const line of lines) {
      emitLine(line);
    }
  }

  const finalText = decoder.decode();
  if (finalText) {
    collected += finalText;
    buffered += finalText;
  }

  if (buffered.trim()) {
    emitLine(buffered);
  }

  return collected;
}

async function runExtractionStrategy(
  options: RunExtractionStrategyOptions & {
    strategyName: string;
    command: string[];
    allowWarningExitCodes?: number[];
  },
): Promise<ExtractionAttemptResult> {
  if (options.signal?.aborted) {
    throw createAbortError('Firmware extraction canceled.');
  }

  let processRef: Bun.Subprocess;
  try {
    processRef = Bun.spawn(options.command, {
      cwd: options.context.workingDirectory,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `${options.strategyName} unavailable: ${message}`,
    };
  }

  options.onProcess?.(processRef);

  let aborted = false;
  let onAbort: (() => void) | null = null;
  if (options.signal) {
    onAbort = () => {
      aborted = true;
      try {
        processRef.kill();
      } catch {
        // Ignore kill failures for already-exited processes.
      }
    };
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const [exitCode, stderr, stdout] = await Promise.all([
      processRef.exited,
      readSubprocessStreamWithLogs(processRef.stderr, (line) => {
        options.onLog?.(`[${options.strategyName}] ${line}`);
      }),
      readSubprocessStreamWithLogs(processRef.stdout, (line) => {
        options.onLog?.(`[${options.strategyName}] ${line}`);
      }),
    ]);

    if (aborted || options.signal?.aborted) {
      throw createAbortError('Firmware extraction canceled.');
    }

    const allowWarnings = options.allowWarningExitCodes || [];
    if (exitCode === 0 || allowWarnings.includes(exitCode)) {
      return { ok: true };
    }

    const detail = [stderr, stdout]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' | ');

    return {
      ok: false,
      message: `${options.strategyName} failed (code ${exitCode})${detail ? `: ${detail}` : ''}`,
    };
  } finally {
    if (options.signal && onAbort) {
      options.signal.removeEventListener('abort', onAbort);
    }
    options.onProcess?.(null);
  }
}

export async function extractFirmwareArchive(options: {
  packagePath: string;
  extractDir: string;
  workingDirectory: string;
  signal?: AbortSignal;
  onProcess?: (process: Bun.Subprocess | null) => void;
  onLog?: (line: string) => void;
}) {
  const extension = getFirmwareArchiveExtension(options.packagePath);
  if (!extension) {
    throw new Error(
      `Unsupported firmware archive type for ${basename(options.packagePath)}. Supported: ${SUPPORTED_FIRMWARE_ARCHIVE_EXTENSIONS.join(', ')}`,
    );
  }

  const context = {
    packagePath: options.packagePath,
    extractDir: options.extractDir,
    extension,
    platform: process.platform,
    workingDirectory: options.workingDirectory,
  } as const;

  const strategies = createExtractionStrategyOrder(context);
  const errors: string[] = [];

  for (const strategy of strategies) {
    const result = await runExtractionStrategy({
      context,
      signal: options.signal,
      onProcess: options.onProcess,
      onLog: options.onLog,
      strategyName: strategy.name,
      command: strategy.buildCommand(context),
      allowWarningExitCodes: strategy.allowWarningExitCodes,
    });

    if (result.ok) {
      return;
    }

    errors.push(result.message);
  }

  const detail = errors.join(' | ');
  if (
    detail.includes('End-of-central-directory signature not found') ||
    detail.includes('zipfile directory') ||
    detail.includes('cannot find zipfile directory') ||
    detail.includes('Unexpected end of archive')
  ) {
    throw new Error(
      'The firmware archive is incomplete or corrupt. Please finish the download or try again.',
    );
  }

  throw new Error(
    `Failed to extract firmware archive (${basename(options.packagePath)}). ${detail || 'No extraction backend succeeded.'}`,
  );
}
