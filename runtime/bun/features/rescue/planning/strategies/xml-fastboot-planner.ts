import { basename } from 'node:path';
import {
  formatFastbootArgs,
  KNOWN_XML_FLASH_SCRIPT_NAMES,
  maybeResolveCommandFileArgument,
  normalizePathForLookup,
  shouldSkipForDataReset,
} from '../../../../firmware-package-utils.ts';
import { defaultFastbootCommandTimeoutMs } from '../../commands/rescue-command-policy.ts';
import type { PreparedFastbootCommand } from '../../commands/rescue-command-types.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';

const knownFastbootXmlNames = new Set<string>(KNOWN_XML_FLASH_SCRIPT_NAMES);
const fastbootOperationNames = new Set([
  'flash',
  'flash_sparse',
  'flashsparse',
  'erase',
  'format',
  'getvar',
  'oem',
  'reboot',
  'reboot-bootloader',
  'reboot-fastboot',
  'continue',
  'set_active',
  'set-active',
  'boot',
]);

type ParsedFastbootXmlStep = {
  operation: string;
  args: string[];
};

function parseXmlAttributes(rawAttributes: string) {
  const attributes = new Map<string, string>();
  const attributeRegex = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of rawAttributes.matchAll(attributeRegex)) {
    const key = (match[1] || '').trim().toLowerCase();
    const value = (match[3] ?? match[4] ?? '').trim();
    if (key) {
      attributes.set(key, value);
    }
  }
  return attributes;
}

function firstNonEmptyValue(attributes: Map<string, string>, names: string[]) {
  for (const name of names) {
    const value = attributes.get(name.toLowerCase())?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function fastbootXmlPrimaryRank(
  sourceFileName: string,
  dataReset: 'yes' | 'no',
  recipePreferredFileNames?: Set<string>,
) {
  const lowerName = sourceFileName.toLowerCase();

  if (recipePreferredFileNames?.has(lowerName)) {
    return 0;
  }

  if (dataReset === 'yes') {
    if (lowerName === 'flashfile.xml') return 1;
    if (lowerName === 'servicefile.xml') return 2;
  } else {
    if (lowerName === 'servicefile.xml') return 1;
    if (lowerName === 'flashfile.xml') return 2;
  }

  if (lowerName === 'softwareupgrade.xml') return 3;
  if (lowerName === 'flashinfo.xml') return 4;
  if (lowerName === 'flashinfo_rsa.xml') return 5;
  if (lowerName === 'efuse.xml') return 6;
  if (lowerName === 'lkbin.xml') return 7;
  if (lowerName.includes('flash')) return 8;
  if (lowerName.includes('service')) return 9;
  if (lowerName.includes('_cfc')) return 10;

  return 11;
}

function compareFastbootXmlCandidates(
  left: { sourceFileName: string },
  right: { sourceFileName: string },
  dataReset: 'yes' | 'no',
  recipePreferredFileNames?: Set<string>,
) {
  const leftRank = fastbootXmlPrimaryRank(left.sourceFileName, dataReset, recipePreferredFileNames);
  const rightRank = fastbootXmlPrimaryRank(
    right.sourceFileName,
    dataReset,
    recipePreferredFileNames,
  );
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.sourceFileName.length !== right.sourceFileName.length) {
    return left.sourceFileName.length - right.sourceFileName.length;
  }

  return left.sourceFileName.localeCompare(right.sourceFileName);
}

function buildArgsForOperation(operation: string, attributes: Map<string, string>) {
  const normalized = operation.toLowerCase();

  if (normalized === 'flash' || normalized === 'flash_sparse' || normalized === 'flashsparse') {
    const partition = firstNonEmptyValue(attributes, ['partition', 'label']);
    const filename = firstNonEmptyValue(attributes, ['filename', 'file', 'image']);
    if (!partition || !filename) {
      return null;
    }
    return ['flash', partition, filename];
  }

  if (normalized === 'erase' || normalized === 'format') {
    const partition = firstNonEmptyValue(attributes, ['partition', 'label']);
    if (!partition) {
      return null;
    }
    return [normalized, partition];
  }

  if (normalized === 'getvar') {
    const variable = firstNonEmptyValue(attributes, ['var', 'name']);
    if (!variable) {
      return null;
    }
    return ['getvar', variable];
  }

  if (normalized === 'oem') {
    const command = firstNonEmptyValue(attributes, ['var', 'command', 'value']);
    if (!command) {
      return null;
    }
    return ['oem', ...command.split(/\s+/).filter(Boolean)];
  }

  if (normalized === 'boot') {
    const filename = firstNonEmptyValue(attributes, ['filename', 'file', 'image']);
    if (!filename) {
      return null;
    }
    return ['boot', filename];
  }

  if (normalized === 'continue') {
    return ['continue'];
  }

  if (normalized === 'set_active' || normalized === 'set-active') {
    const slot = firstNonEmptyValue(attributes, ['slot', 'var', 'value', 'partition']);
    if (!slot) {
      return null;
    }
    return ['set-active', slot];
  }

  if (normalized === 'reboot') {
    const target = firstNonEmptyValue(attributes, ['target', 'mode', 'var', 'value']);
    return target ? ['reboot', target] : ['reboot'];
  }

  if (normalized === 'reboot-bootloader') {
    return ['reboot', 'bootloader'];
  }

  if (normalized === 'reboot-fastboot') {
    return ['reboot', 'fastboot'];
  }

  return null;
}

function shouldSoftFailFastbootCommand(args: string[]) {
  const verb = (args[0] || '').toLowerCase();
  const subject = (args[1] || '').toLowerCase();
  return verb === 'getvar' && subject === 'max-sparse-size';
}

function parseFastbootXmlSteps(xmlText: string) {
  const parsedSteps: ParsedFastbootXmlStep[] = [];
  const warnings: string[] = [];
  const stepRegex =
    /<(step|flash|erase|format|getvar|oem|reboot|reboot-bootloader|reboot-fastboot|continue|set_active|set-active|boot)\b([^>]*)\/?>/gi;

  for (const match of xmlText.matchAll(stepRegex)) {
    const tagName = (match[1] || '').toLowerCase();
    const attributes = parseXmlAttributes(match[2] || '');
    const operation = firstNonEmptyValue(attributes, ['operation']).toLowerCase() || tagName;

    if (!fastbootOperationNames.has(operation)) {
      continue;
    }

    const args = buildArgsForOperation(operation, attributes);
    if (!args) {
      warnings.push(`Skipped malformed Fastboot XML step for operation "${operation}".`);
      continue;
    }

    parsedSteps.push({
      operation,
      args,
    });
  }

  return {
    parsedSteps,
    warnings,
  };
}

async function findFastbootXmlCandidates(extractedFiles: string[]) {
  const candidates: Array<{
    filePath: string;
    sourceFileName: string;
    xmlText: string;
  }> = [];

  for (const filePath of extractedFiles) {
    const lowerName = basename(filePath).toLowerCase();
    if (!lowerName.endsWith('.xml')) {
      continue;
    }
    if (!knownFastbootXmlNames.has(lowerName) && !lowerName.includes('_cfc')) {
      continue;
    }

    try {
      const xmlText = await Bun.file(filePath).text();
      const hasFastbootOperation =
        /\boperation\s*=\s*["'](?:flash|flash_sparse|flashsparse|erase|format|getvar|oem|reboot(?:-bootloader|-fastboot)?|continue|set[-_]?active|boot)["']/i.test(
          xmlText,
        ) ||
        /<(flash|erase|format|getvar|oem|reboot|continue|set_active|set-active|boot)\b/i.test(
          xmlText,
        );
      if (!hasFastbootOperation) {
        continue;
      }

      candidates.push({
        filePath,
        sourceFileName: basename(filePath),
        xmlText,
      });
    } catch {
      // Ignore unreadable XML candidates.
    }
  }

  return candidates;
}

export const xmlFastbootPlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'fastboot-xml',
  priority: 125,
  async plan(context) {
    const xmlCandidates = await findFastbootXmlCandidates(context.extractedFiles);
    if (xmlCandidates.length === 0) {
      return null;
    }

    const bestCandidate =
      [...xmlCandidates].sort((left, right) =>
        compareFastbootXmlCandidates(
          left,
          right,
          context.dataReset,
          context.recipeHints?.preferredFileNames,
        ),
      )[0] || null;
    if (!bestCandidate) {
      return null;
    }

    const { parsedSteps, warnings } = parseFastbootXmlSteps(bestCandidate.xmlText);
    if (parsedSteps.length === 0) {
      return {
        plannerId: 'fastboot-xml',
        plannerPriority: 125,
        commandSource: `fastboot:${bestCandidate.sourceFileName}`,
        sourceFileName: bestCandidate.sourceFileName,
        commands: [],
        warnings: warnings.length
          ? warnings
          : [`${bestCandidate.sourceFileName} did not contain any supported Fastboot steps.`],
      };
    }

    const commands: PreparedFastbootCommand[] = [];
    const skippedWarnings = [...warnings];

    for (const step of parsedSteps) {
      let commandArgs = step.args.slice();
      if (commandArgs.length >= 2) {
        commandArgs = await maybeResolveCommandFileArgument(
          commandArgs,
          context.workDir,
          context.fileIndex,
        );
      }

      if (shouldSkipForDataReset(commandArgs, context.dataReset)) {
        skippedWarnings.push(
          `Skipped wipe-sensitive Fastboot step: ${formatFastbootArgs(commandArgs)}`,
        );
        continue;
      }

      const normalizedArgs = commandArgs.map((part, index) =>
        index >= 2 ? normalizePathForLookup(part) || part : part,
      );
      commands.push({
        tool: 'fastboot',
        label: formatFastbootArgs(normalizedArgs),
        softFail: shouldSoftFailFastbootCommand(normalizedArgs),
        timeoutMs: defaultFastbootCommandTimeoutMs,
        args: normalizedArgs,
      });
    }

    if (commands.length === 0) {
      return {
        plannerId: 'fastboot-xml',
        plannerPriority: 125,
        commandSource: `fastboot:${bestCandidate.sourceFileName}`,
        sourceFileName: bestCandidate.sourceFileName,
        commands: [],
        warnings:
          skippedWarnings.length > 0
            ? skippedWarnings
            : [
                `All Fastboot steps in ${bestCandidate.sourceFileName} were skipped by the current rescue settings.`,
              ],
      };
    }

    return {
      plannerId: 'fastboot-xml',
      plannerPriority: 125,
      commandSource: `fastboot:${bestCandidate.sourceFileName}`,
      sourceFileName: bestCandidate.sourceFileName,
      commands,
      warnings: skippedWarnings,
    };
  },
};
