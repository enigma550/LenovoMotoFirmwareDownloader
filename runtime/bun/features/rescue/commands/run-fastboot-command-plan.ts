import { runCommandWithAbort } from '../device-flasher.ts';
import type { PreparedFastbootCommand } from '../fastboot-parser.ts';
import { createFastbootCommands } from './fastboot-command.ts';

function isAbortError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message)) {
    return true;
  }
  return false;
}

export async function runFastbootCommandPlan(options: {
  preparedCommands: PreparedFastbootCommand[];
  workDir: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
  onStep: (payload: { stepIndex: number; stepTotal: number; stepLabel: string }) => void;
}) {
  const commands = createFastbootCommands(options.preparedCommands);

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (!command) {
      continue;
    }

    options.onStep({
      stepIndex: index + 1,
      stepTotal: commands.length,
      stepLabel: command.label,
    });

    try {
      await command.execute(async (args) => {
        await runCommandWithAbort({
          command: 'fastboot',
          args,
          cwd: options.workDir,
          timeoutMs: command.timeoutMs,
          signal: options.signal,
          onProcess: options.onProcess,
        });
      });
    } catch (error) {
      if (command.softFail && !isAbortError(error)) {
        continue;
      }
      throw error;
    }
  }
}
