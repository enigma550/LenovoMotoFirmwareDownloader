import { basename } from 'node:path';
import { pickScriptCommands } from '../../fastboot-parser.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';

export const scriptFastbootPlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'script-fastboot',
  priority: 90,
  async plan(context) {
    const prepared = await pickScriptCommands(
      context.workDir,
      context.extractedFiles,
      context.dataReset,
      context.fileIndex,
      context.recipeHints,
    );
    if (!prepared) {
      return null;
    }

    const sourceFileName = basename(prepared.scriptPath);
    return {
      plannerId: 'script-fastboot',
      plannerPriority: 90,
      commandSource: `script:${sourceFileName}`,
      sourceFileName,
      commands: prepared.commands.map((command) => ({
        ...command,
        tool: 'fastboot' as const,
      })),
      warnings: [],
    };
  },
};
