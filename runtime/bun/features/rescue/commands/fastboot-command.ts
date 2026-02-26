import type { PreparedFastbootCommand } from '../fastboot-parser.ts';

export type FastbootCommandExecutor = (args: string[]) => Promise<void>;

export type FastbootCommand = {
  args: string[];
  label: string;
  softFail: boolean;
  timeoutMs: number;
  execute: (executor: FastbootCommandExecutor) => Promise<void>;
};

export function createFastbootCommand(prepared: PreparedFastbootCommand): FastbootCommand {
  const args = [...prepared.args];
  const label = prepared.label;
  const softFail = Boolean(prepared.softFail);
  const timeoutMs = prepared.timeoutMs;

  return {
    args,
    label,
    softFail,
    timeoutMs,
    execute: (executor) => executor(args),
  };
}

export function createFastbootCommands(prepared: PreparedFastbootCommand[]) {
  return prepared.map((command) => createFastbootCommand(command));
}
