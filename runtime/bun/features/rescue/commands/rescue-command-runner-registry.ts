import { isCommandAvailable, runCommandWithAbort } from '../device-flasher.ts';
import { disposeFastbootRunnerContext, runFastbootCommand } from './fastboot-command-runner.ts';
import { qdlCommandDisplayName, resolveQdlCommand } from './qdl-command.ts';
import {
  resolveUnisocPacCommandArgs,
  resolveUnisocPacToolCandidates,
} from './rescue-command-policy.ts';
import type { RescueCommandExecutionContext } from './rescue-command-runner-context.ts';
import type {
  PreparedEdlFirehoseCommand,
  PreparedFastbootCommand,
  PreparedRescueCommand,
  PreparedUnisocPacCommand,
} from './rescue-command-types.ts';

type RescueCommandRunnerMap = {
  [Tool in PreparedRescueCommand['tool']]: (
    command: Extract<PreparedRescueCommand, { tool: Tool }>,
    context: RescueCommandExecutionContext,
  ) => Promise<void>;
};

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

function createMissingUnisocToolError() {
  const candidates = resolveUnisocPacToolCandidates();
  return new Error(
    `Unisoc PAC rescue requires spd-tool in PATH (${candidates.join(', ')}). ` +
      'Install github:enigma550/spd-tool-bun or set RESCUE_UNISOC_TOOL to override the executable path.',
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

async function runEdlFirehoseCommand(
  command: PreparedEdlFirehoseCommand,
  context: RescueCommandExecutionContext,
) {
  const qdlCommand = await resolveQdlCommand();
  const buildArgs = (options?: { dryRun?: boolean }) => {
    const args = ['--storage', command.storage];
    if (options?.dryRun) {
      args.push('--dry-run');
    } else if (command.serial) {
      args.push('--serial', command.serial);
    }
    for (const includePath of command.includePaths || []) {
      args.push('--include', includePath);
    }
    args.push(command.programmerPath, command.rawprogramPath);
    if (command.patchPath) {
      args.push(command.patchPath);
    }
    return args;
  };

  try {
    if (command.validateWithDryRun) {
      context.onConsoleLine?.({
        message: 'Validating QDL plan with --dry-run before flashing...',
        tone: 'verbose',
      });
      await runCommandWithAbort({
        command: qdlCommand.command,
        args: buildArgs({ dryRun: true }),
        cwd: context.workDir,
        timeoutMs: Math.min(command.timeoutMs, 2 * 60 * 1000),
        signal: context.signal,
        onProcess: context.onProcess,
      });
    }

    await runCommandWithAbort({
      command: qdlCommand.command,
      args: buildArgs(),
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
  fastboot: runFastbootCommand as (
    command: PreparedFastbootCommand,
    context: RescueCommandExecutionContext,
  ) => Promise<void>,
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

export async function disposeRescueCommandExecutionContext(context: RescueCommandExecutionContext) {
  await disposeFastbootRunnerContext(context);
}
