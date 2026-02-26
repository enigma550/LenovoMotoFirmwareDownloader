import { runPreparedRescueCommand } from './rescue-command-runner-registry.ts';
import type { PreparedRescueCommand } from './rescue-command-types.ts';

function isAbortError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message)) {
    return true;
  }
  return false;
}

export async function runRescueCommandPlan(options: {
  preparedCommands: PreparedRescueCommand[];
  workDir: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
  onStep: (payload: { stepIndex: number; stepTotal: number; stepLabel: string }) => void;
}) {
  const executionContext = {
    workDir: options.workDir,
    signal: options.signal,
    onProcess: options.onProcess,
    state: {
      resolvedUnisocTool: undefined as string | undefined,
    },
  };

  for (let index = 0; index < options.preparedCommands.length; index += 1) {
    const command = options.preparedCommands[index];
    if (!command) {
      continue;
    }

    options.onStep({
      stepIndex: index + 1,
      stepTotal: options.preparedCommands.length,
      stepLabel: command.label,
    });

    try {
      await runPreparedRescueCommand(command, executionContext);
    } catch (error) {
      if (command.softFail && !isAbortError(error)) {
        continue;
      }
      throw error;
    }
  }
}
