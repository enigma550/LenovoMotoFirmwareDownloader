import { basename, relative } from 'node:path';
import { defaultUnisocCommandTimeoutMs } from '../../commands/rescue-command-policy.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';

function pacCandidateRank(filePath: string, recipePreferredFileNames?: Set<string>) {
  const lowerName = basename(filePath).toLowerCase();

  if (recipePreferredFileNames?.has(lowerName)) {
    return 0;
  }

  if (lowerName.includes('upgrade')) return 1;
  if (lowerName.includes('factory')) return 2;
  if (lowerName.includes('service')) return 3;
  if (lowerName.endsWith('.pac')) return 4;

  return 5;
}

function comparePacCandidates(left: string, right: string, recipePreferredFileNames?: Set<string>) {
  const leftRank = pacCandidateRank(left, recipePreferredFileNames);
  const rightRank = pacCandidateRank(right, recipePreferredFileNames);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftName = basename(left);
  const rightName = basename(right);
  if (leftName.length !== rightName.length) {
    return leftName.length - rightName.length;
  }

  return leftName.localeCompare(rightName);
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
      [...pacCandidates].sort((left, right) =>
        comparePacCandidates(left, right, context.recipeHints?.preferredFileNames),
      )[0] || null;
    if (!bestCandidate) {
      return null;
    }

    const pacPath = relative(context.workDir, bestCandidate);
    const sourceFileName = basename(bestCandidate);

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
