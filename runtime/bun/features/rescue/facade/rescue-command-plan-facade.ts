import { basename } from 'node:path';
import type { RescueFlashTransport, RescueQdlStorage } from '../../../../shared/desktop-rpc';
import {
  collectFilesRecursive,
  createFileIndex,
  KNOWN_XML_FLASH_SCRIPT_NAMES,
} from '../../../firmware-package-utils.ts';
import type { PreparedRescueCommand } from '../commands/rescue-command-types.ts';
import { createRescueCommandPlannerStrategies } from '../planning/command-planner-factory.ts';
import { selectRescueCommandCandidate } from '../planning/command-planner-selection.ts';
import type {
  RescueCommandPlanCandidate,
  RescuePlannerId,
} from '../planning/command-planner-types.ts';
import type { RescueRecipeHints } from '../recipe-resolver.ts';

export type RescueCommandPlan = {
  commands: PreparedRescueCommand[];
  commandPlan: string[];
  commandSource: string;
  xmlWarnings: string[];
};

function withRecipeGuidedSuffix(
  source: string,
  candidateFileName: string,
  recipeHints?: RescueRecipeHints,
) {
  if (!recipeHints?.preferredFileNames.has(candidateFileName.toLowerCase())) {
    return source;
  }
  return `${source} (recipe-guided)`;
}

function detectEdlSignatures(extractedFiles: string[]) {
  const signatures = new Set<string>();

  for (const filePath of extractedFiles) {
    const lowerName = basename(filePath).toLowerCase();

    if (lowerName.startsWith('rawprogram') && lowerName.endsWith('.xml')) {
      signatures.add(lowerName);
    }
    if (lowerName.startsWith('patch') && lowerName.endsWith('.xml')) {
      signatures.add(lowerName);
    }
    if (lowerName === 'loadinfo.xml') {
      signatures.add(lowerName);
    }
    if (
      lowerName.includes('firehose') &&
      (lowerName.endsWith('.mbn') || lowerName.endsWith('.elf') || lowerName.endsWith('.bin'))
    ) {
      signatures.add(lowerName);
    }
  }

  return [...signatures];
}

function detectUnisocSignatures(extractedFiles: string[]) {
  const signatures = new Set<string>();
  for (const filePath of extractedFiles) {
    const lowerName = basename(filePath).toLowerCase();
    if (lowerName.endsWith('.pac')) {
      signatures.add(lowerName);
    }
  }
  return [...signatures];
}

function detectFastbootSignatures(extractedFiles: string[]) {
  const signatures = new Set<string>();
  const knownFastbootNames = new Set<string>(KNOWN_XML_FLASH_SCRIPT_NAMES);

  for (const filePath of extractedFiles) {
    const lowerName = basename(filePath).toLowerCase();
    if (knownFastbootNames.has(lowerName) || lowerName.includes('_cfc.xml')) {
      signatures.add(lowerName);
    }
  }

  return [...signatures];
}

function plannerAllowedForTransport(
  plannerId: RescuePlannerId,
  flashTransport: RescueFlashTransport,
) {
  if (flashTransport === 'fastboot') {
    return plannerId === 'fastboot-xml';
  }
  if (flashTransport === 'qdl') {
    return plannerId === 'edl-firehose';
  }
  if (flashTransport === 'unisoc') {
    return plannerId === 'unisoc-pac';
  }
  return false;
}

function filterCandidatesByTransport(
  candidates: RescueCommandPlanCandidate[],
  flashTransport: RescueFlashTransport,
) {
  return candidates.filter((candidate) =>
    plannerAllowedForTransport(candidate.plannerId, flashTransport),
  );
}

export async function buildRescueCommandPlan(options: {
  workDir: string;
  dataReset: 'yes' | 'no';
  flashTransport?: RescueFlashTransport;
  qdlStorage?: RescueQdlStorage;
  qdlSerial?: string;
  recipeHints?: RescueRecipeHints;
}): Promise<RescueCommandPlan> {
  const flashTransport = options.flashTransport || 'fastboot';
  if (flashTransport === 'mediatek') {
    throw new Error(
      'MediaTek rescue transport is still exposed in the UI, but no runtime flashing backend is wired into this project yet.',
    );
  }
  const qdlStorage = options.qdlStorage || 'auto';
  const qdlSerial = options.qdlSerial?.trim() || undefined;
  const extractedFiles = await collectFilesRecursive(options.workDir);
  const fileIndex = createFileIndex(extractedFiles);

  const strategies = createRescueCommandPlannerStrategies();
  const allCandidates = (
    await Promise.all(
      strategies.map((strategy) =>
        strategy.plan({
          workDir: options.workDir,
          dataReset: options.dataReset,
          qdlStorage,
          qdlSerial,
          recipeHints: options.recipeHints,
          extractedFiles,
          fileIndex,
        }),
      ),
    )
  ).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const candidates = filterCandidatesByTransport(allCandidates, flashTransport);

  const { selected, xmlWarnings } = selectRescueCommandCandidate(candidates);

  if (!selected || selected.commands.length === 0) {
    const fastbootSignatures = detectFastbootSignatures(extractedFiles);
    const edlSignatures = detectEdlSignatures(extractedFiles);
    const unisocSignatures = detectUnisocSignatures(extractedFiles);
    if (flashTransport === 'fastboot') {
      const fastbootCandidate = allCandidates.find(
        (candidate) => candidate.plannerId === 'fastboot-xml',
      );
      if (fastbootCandidate?.warnings?.length) {
        throw new Error(fastbootCandidate.warnings[0]);
      }
      if (fastbootSignatures.length > 0) {
        throw new Error(
          `Detected Fastboot-style firmware resources (${fastbootSignatures.slice(0, 3).join(', ')}), but no executable Fastboot command plan could be built for this package.`,
        );
      }
      if (edlSignatures.length > 0) {
        throw new Error(
          `Detected EDL-style firmware resources (${edlSignatures.slice(0, 3).join(', ')}). Select QDL mode for this package.`,
        );
      }
      if (unisocSignatures.length > 0) {
        throw new Error(
          `Detected Unisoc PAC resources (${unisocSignatures.slice(0, 3).join(', ')}). Select Unisoc mode for this package.`,
        );
      }
      throw new Error(
        'Fastboot mode was selected, but this package does not contain supported Fastboot XML resources.',
      );
    }

    if (flashTransport === 'qdl') {
      const edlCandidate = allCandidates.find(
        (candidate) => candidate.plannerId === 'edl-firehose',
      );
      if (edlCandidate?.warnings?.length) {
        throw new Error(edlCandidate.warnings[0]);
      }
      if (edlSignatures.length > 0) {
        throw new Error(
          `Detected EDL-style firmware resources (${edlSignatures.slice(0, 3).join(', ')}), but no executable EDL command plan could be built for this package.`,
        );
      }
      if (unisocSignatures.length > 0) {
        throw new Error(
          `Detected Unisoc PAC resources (${unisocSignatures.slice(0, 3).join(', ')}). Select Unisoc mode for this package.`,
        );
      }
      throw new Error(
        'QDL mode was selected, but this package does not contain EDL/rawprogram resources.',
      );
    }

    const unisocCandidate = allCandidates.find((candidate) => candidate.plannerId === 'unisoc-pac');
    if (unisocCandidate?.warnings?.length) {
      throw new Error(unisocCandidate.warnings[0]);
    }
    if (unisocSignatures.length > 0) {
      throw new Error(
        `Detected Unisoc PAC resources (${unisocSignatures.slice(0, 3).join(', ')}), but no executable Unisoc command plan could be built for this package.`,
      );
    }
    if (edlSignatures.length > 0) {
      throw new Error(
        `Detected EDL-style firmware resources (${edlSignatures.slice(0, 3).join(', ')}). Select QDL mode for this package.`,
      );
    }
    throw new Error('Unisoc mode was selected, but this package does not contain PAC resources.');
  }

  const commands: PreparedRescueCommand[] = selected.commands;
  const commandSource = withRecipeGuidedSuffix(
    selected.commandSource,
    selected.sourceFileName,
    options.recipeHints,
  );

  return {
    commands,
    commandPlan: commands.map((command) => command.label),
    commandSource,
    xmlWarnings,
  };
}
