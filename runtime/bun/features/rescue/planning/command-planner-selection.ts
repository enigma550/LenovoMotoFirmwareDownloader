import type { RescueCommandPlanCandidate } from './command-planner-types.ts';

export type RescueCommandSelectionResult = {
  selected: RescueCommandPlanCandidate | null;
  xmlWarnings: string[];
};

export function selectRescueCommandCandidate(
  candidates: RescueCommandPlanCandidate[],
): RescueCommandSelectionResult {
  const edlCandidate =
    candidates.find((candidate) => candidate.plannerId === 'edl-firehose') || null;
  if (edlCandidate && edlCandidate.commands.length > 0) {
    const xmlCandidate =
      candidates.find((candidate) => candidate.plannerId === 'xml-fastboot') || null;
    return {
      selected: edlCandidate,
      xmlWarnings: xmlCandidate?.warnings || [],
    };
  }

  const xmlCandidate =
    candidates.find((candidate) => candidate.plannerId === 'xml-fastboot') || null;
  const scriptCandidate =
    candidates.find((candidate) => candidate.plannerId === 'script-fastboot') || null;

  if (xmlCandidate && scriptCandidate) {
    const xmlCommandCount = xmlCandidate.commands.length;
    const scriptCommandCount = scriptCandidate.commands.length;

    if (xmlCommandCount === 0 && scriptCommandCount > 0) {
      return {
        selected: scriptCandidate,
        xmlWarnings: xmlCandidate.warnings,
      };
    }

    if (xmlCommandCount > 0 && scriptCommandCount > xmlCommandCount + 5) {
      return {
        selected: scriptCandidate,
        xmlWarnings: xmlCandidate.warnings,
      };
    }

    if (xmlCommandCount > 0) {
      return {
        selected: xmlCandidate,
        xmlWarnings: xmlCandidate.warnings,
      };
    }
  }

  const selected =
    candidates
      .filter((candidate) => candidate.commands.length > 0)
      .sort((left, right) => right.plannerPriority - left.plannerPriority)[0] || null;

  return {
    selected,
    xmlWarnings: xmlCandidate?.warnings || [],
  };
}
