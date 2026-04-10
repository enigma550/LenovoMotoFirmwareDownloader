import type { RescueCommandPlanCandidate } from './command-planner-types.ts';

export type RescueCommandSelectionResult = {
  selected: RescueCommandPlanCandidate | null;
  xmlWarnings: string[];
};

export function selectRescueCommandCandidate(
  candidates: RescueCommandPlanCandidate[],
): RescueCommandSelectionResult {
  const selected =
    candidates
      .filter((candidate) => candidate.commands.length > 0)
      .sort((left, right) => right.plannerPriority - left.plannerPriority)[0] || null;

  return {
    selected,
    xmlWarnings: selected?.warnings || [],
  };
}
