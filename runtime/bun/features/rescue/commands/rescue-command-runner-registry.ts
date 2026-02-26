import { isCommandAvailable, runCommandWithAbort } from '../device-flasher.ts';
import { qdlCommandDisplayName, resolveQdlCommand } from './qdl-command.ts';
import {
  resolveUnisocPacCommandArgs,
  resolveUnisocPacToolCandidates,
} from './rescue-command-policy.ts';
import type {
  PreparedEdlFirehoseCommand,
  PreparedFastbootRescueCommand,
  PreparedRescueCommand,
  PreparedUnisocPacCommand,
} from './rescue-command-types.ts';

export type RescueCommandExecutionContext = {
  workDir: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
  state: {
    resolvedUnisocTool?: string;
  };
};

type RescueCommandRunnerMap = {
  [Tool in PreparedRescueCommand['tool']]: (
    command: Extract<PreparedRescueCommand, { tool: Tool }>,
    context: RescueCommandExecutionContext,
  ) => Promise<void>;
};

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

function createMissingUnisocToolError() {
  const candidates = resolveUnisocPacToolCandidates();
  return new Error(
    `Unisoc PAC rescue requires a supported tool in PATH (${candidates.join(', ')}). ` +
      'Set RESCUE_UNISOC_TOOL to override the executable name/path if needed.',
  );
}

async function resolveAvailableUnisocPacTool(options: {
  workDir: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
  preferredTool?: string;
}) {
  const candidates = options.preferredTool
    ? [options.preferredTool, ...resolveUnisocPacToolCandidates()]
    : resolveUnisocPacToolCandidates();
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  for (const candidate of uniqueCandidates) {
    const available = await isCommandAvailable({
      command: candidate,
      args: [],
      cwd: options.workDir,
      signal: options.signal,
      onProcess: options.onProcess,
    });
    if (available) {
      return candidate;
    }
  }

  throw createMissingUnisocToolError();
}

async function runFastbootCommand(
  command: PreparedFastbootRescueCommand,
  context: RescueCommandExecutionContext,
) {
  await runCommandWithAbort({
    command: 'fastboot',
    args: command.args,
    cwd: context.workDir,
    timeoutMs: command.timeoutMs,
    signal: context.signal,
    onProcess: context.onProcess,
  });
}

async function runEdlFirehoseCommand(
  command: PreparedEdlFirehoseCommand,
  context: RescueCommandExecutionContext,
) {
  const qdlCommand = await resolveQdlCommand();
  const args = ['--storage', command.storage, command.programmerPath, command.rawprogramPath];
  if (command.serial) {
    args.unshift(command.serial);
    args.unshift('--serial');
  }
  if (command.patchPath) {
    args.push(command.patchPath);
  }

  try {
    await runCommandWithAbort({
      command: qdlCommand.command,
      args,
      cwd: context.workDir,
      timeoutMs: command.timeoutMs,
      signal: context.signal,
      onProcess: context.onProcess,
    });
  } catch (error) {
    if (isCommandNotFoundError(error)) {
      if (qdlCommand.source === 'bundled' || qdlCommand.source === 'custom') {
        throw new Error(
          `EDL/firehose rescue could not execute ${qdlCommandDisplayName(qdlCommand.command)}.`,
        );
      }
      throw new Error('EDL/firehose rescue requires `qdl` in PATH. Install qdl and retry.');
    }
    throw error;
  }
}

async function runUnisocPacCommand(
  command: PreparedUnisocPacCommand,
  context: RescueCommandExecutionContext,
) {
  if (command.dataReset === 'no') {
    throw new Error(
      'Data reset = no is not yet supported for Unisoc PAC mode. Use data reset = yes.',
    );
  }

  const args = resolveUnisocPacCommandArgs(command.pacPath);
  let tool = await resolveAvailableUnisocPacTool({
    workDir: context.workDir,
    signal: context.signal,
    onProcess: context.onProcess,
    preferredTool: context.state.resolvedUnisocTool,
  });

  try {
    await runCommandWithAbort({
      command: tool,
      args,
      cwd: context.workDir,
      timeoutMs: command.timeoutMs,
      signal: context.signal,
      onProcess: context.onProcess,
    });
  } catch (error) {
    if (!isCommandNotFoundError(error)) {
      throw error;
    }

    tool = await resolveAvailableUnisocPacTool({
      workDir: context.workDir,
      signal: context.signal,
      onProcess: context.onProcess,
    });
    await runCommandWithAbort({
      command: tool,
      args,
      cwd: context.workDir,
      timeoutMs: command.timeoutMs,
      signal: context.signal,
      onProcess: context.onProcess,
    });
  }

  context.state.resolvedUnisocTool = tool;
}

const rescueCommandRunnerRegistry: RescueCommandRunnerMap = {
  fastboot: runFastbootCommand,
  'edl-firehose': runEdlFirehoseCommand,
  'unisoc-pac': runUnisocPacCommand,
};

export async function runPreparedRescueCommand(
  command: PreparedRescueCommand,
  context: RescueCommandExecutionContext,
) {
  const runner = rescueCommandRunnerRegistry[command.tool] as (
    command: PreparedRescueCommand,
    context: RescueCommandExecutionContext,
  ) => Promise<void>;

  await runner(command, context);
}
