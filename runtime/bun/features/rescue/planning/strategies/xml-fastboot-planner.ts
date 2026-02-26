import { basename } from 'node:path';
import { pickFlashScript, prepareCommandsFromXml } from '../../fastboot-parser.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';

function isMissingXmlPlanError<ErrorValue>(error: ErrorValue) {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('No XML flash script found') ||
    error.message.includes('No usable XML flash instructions')
  );
}

export const xmlFastbootPlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'xml-fastboot',
  priority: 100,
  async plan(context) {
    try {
      const { scriptPath, steps } = await pickFlashScript(
        context.workDir,
        context.dataReset,
        context.recipeHints,
      );
      const prepared = await prepareCommandsFromXml(
        steps,
        context.dataReset,
        context.workDir,
        context.fileIndex,
      );
      const sourceFileName = basename(scriptPath);
      return {
        plannerId: 'xml-fastboot',
        plannerPriority: 100,
        commandSource: `xml:${sourceFileName}`,
        sourceFileName,
        commands: prepared.commands.map((command) => ({
          ...command,
          tool: 'fastboot' as const,
        })),
        warnings: prepared.warnings,
      };
    } catch (error) {
      if (isMissingXmlPlanError(error)) {
        return null;
      }
      throw error;
    }
  },
};
