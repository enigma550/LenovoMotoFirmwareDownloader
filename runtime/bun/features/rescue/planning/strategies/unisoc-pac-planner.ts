import { basename, relative } from 'node:path';
import { defaultUnisocCommandTimeoutMs } from '../../commands/rescue-command-policy.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';

function pacCandidatePriority(filePath: string, recipePreferredFileNames?: Set<string>) {
  const lowerName = basename(filePath).toLowerCase();
  let score = 0;

  if (lowerName.includes('service')) {
    score += 20;
  }
  if (lowerName.includes('upgrade')) {
    score += 40;
  }
  if (lowerName.includes('factory')) {
    score += 30;
  }
  if (lowerName.endsWith('.pac')) {
    score += 10;
  }
  if (recipePreferredFileNames?.has(lowerName)) {
    score += 200;
  }

  return score;
}

export const unisocPacPlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'unisoc-pac',
  priority: 115,
  async plan(context) {
    const pacCandidates = context.extractedFiles.filter((filePath) =>
      basename(filePath).toLowerCase().endsWith('.pac'),
    );
    if (pacCandidates.length === 0) {
      return null;
    }

    const bestCandidate =
      pacCandidates
        .map((filePath) => ({
          filePath,
          score:
            pacCandidatePriority(filePath, context.recipeHints?.preferredFileNames) * 1000 -
            basename(filePath).length,
        }))
        .sort((left, right) => right.score - left.score)[0] || null;
    if (!bestCandidate) {
      return null;
    }

    const pacPath = relative(context.workDir, bestCandidate.filePath);
    const sourceFileName = basename(bestCandidate.filePath);

    return {
      plannerId: 'unisoc-pac',
      plannerPriority: 115,
      commandSource: `unisoc:${sourceFileName}`,
      sourceFileName,
      commands: [
        {
          tool: 'unisoc-pac',
          label: `unisoc-pac ${pacPath}`,
          softFail: false,
          timeoutMs: defaultUnisocCommandTimeoutMs,
          pacPath,
          dataReset: context.dataReset,
        },
      ],
      warnings: [],
    };
  },
};
