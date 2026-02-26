import { basename, extname, relative } from 'node:path';
import {
  collectFilesRecursive,
  formatFastbootArgs,
  isWipeSensitivePartition,
  maybeResolveCommandFileArgument,
  parseCommandTokens,
  resolveStepFilePath,
  shouldSkipForDataReset,
} from '../../firmware-package-utils.ts';
import {
  resolveFastbootCommandTimeoutMs,
  shouldIgnoreFastbootCommandResult,
} from './commands/rescue-command-policy.ts';
import type { RescueRecipeHints } from './recipe-resolver.ts';

export type XmlStep = {
  operation: string;
  attrs: Record<string, string>;
};

export type PreparedFastbootCommand = {
  args: string[];
  label: string;
  softFail: boolean;
  timeoutMs: number;
};

function parseXmlSteps(xmlText: string) {
  const stepTags = parseStepTags(xmlText);
  if (stepTags.length > 0) {
    return stepTags;
  }

  return parseDirectOperationTags(xmlText);
}

function parseStepTags(xmlText: string) {
  const stepRegex = /<step\b([^>]*?)\/?>/gi;
  const steps: XmlStep[] = [];
  let match = stepRegex.exec(xmlText);
  while (match !== null) {
    const attrs = parseAttributes(match[1] || '');
    const operation = (attrs.operation || attrs.op || '').trim().toLowerCase();
    if (!operation) {
      match = stepRegex.exec(xmlText);
      continue;
    }
    steps.push({ operation, attrs });
    match = stepRegex.exec(xmlText);
  }
  return steps;
}

function parseDirectOperationTags(xmlText: string) {
  const directTagRegex =
    /<(flash_sparse|flashsparse|flash|erase|format|oem|getvar|reboot(?:-bootloader|-fastboot)?|boot|continue|set_active|set-active|update)\b([^>]*?)\/?>/gi;
  const steps: XmlStep[] = [];
  let match = directTagRegex.exec(xmlText);
  while (match !== null) {
    const tagName = (match[1] || '').trim().toLowerCase();
    if (!tagName) {
      match = directTagRegex.exec(xmlText);
      continue;
    }
    const attrs = parseAttributes(match[2] || '');
    steps.push({
      operation: tagName,
      attrs,
    });
    match = directTagRegex.exec(xmlText);
  }

  return steps;
}

function parseAttributes(attributeSource: string) {
  const attributes: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(['"])(.*?)\2/g;
  let match = attrRegex.exec(attributeSource);
  while (match !== null) {
    const [, key, , value] = match;
    if (!key) {
      match = attrRegex.exec(attributeSource);
      continue;
    }
    attributes[key.toLowerCase()] = value?.trim() || '';
    match = attrRegex.exec(attributeSource);
  }
  return attributes;
}

async function buildFastbootArgsForStep(
  step: XmlStep,
  dataReset: 'yes' | 'no',
  extractDir: string,
  fileIndex: Map<string, string[]>,
) {
  const attrs = step.attrs;
  const op = step.operation.toLowerCase();
  const partition = (attrs.partition || attrs.label || '').trim();
  const fileName = (attrs.filename || attrs.file || attrs.filepath || attrs.path || '').trim();

  if (op === 'flash') {
    if (!partition || !fileName) {
      throw new Error('Flash step is missing partition and/or filename.');
    }
    if (dataReset === 'no' && isWipeSensitivePartition(partition)) {
      return {
        args: null,
        skipReason: `skip flash ${partition} (data reset = no)`,
      };
    }
    const resolvedFilePath = await resolveStepFilePath(extractDir, fileName, fileIndex);
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ['flash', partition, fastbootPath] };
  }

  if (op === 'flash_sparse' || op === 'flashsparse') {
    if (!partition || !fileName) {
      throw new Error(`${op} step is missing partition and/or filename.`);
    }
    if (dataReset === 'no' && isWipeSensitivePartition(partition)) {
      return {
        args: null,
        skipReason: `skip ${op} ${partition} (data reset = no)`,
      };
    }
    const resolvedFilePath = await resolveStepFilePath(extractDir, fileName, fileIndex);
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ['flash', partition, fastbootPath] };
  }

  if (op === 'erase' || op === 'format') {
    if (!partition) {
      throw new Error(`${op} step is missing partition.`);
    }
    if (dataReset === 'no' && isWipeSensitivePartition(partition)) {
      return {
        args: null,
        skipReason: `skip ${op} ${partition} (data reset = no)`,
      };
    }
    return { args: [op, partition] };
  }

  if (op === 'oem') {
    const commandValue = (attrs.var || attrs.value || attrs.command || attrs.arg || '').trim();
    if (!commandValue) {
      throw new Error('OEM step is missing command value.');
    }
    return { args: ['oem', ...commandValue.split(/\s+/).filter(Boolean)] };
  }

  if (op === 'getvar') {
    const variable = (attrs.var || attrs.value || '').trim();
    if (!variable) {
      throw new Error('getvar step is missing target variable.');
    }
    return { args: ['getvar', variable] };
  }

  if (op === 'reboot') {
    const target = (attrs.var || attrs.value || attrs.target || '').trim();
    return {
      args: target ? ['reboot', ...target.split(/\s+/).filter(Boolean)] : ['reboot'],
    };
  }

  if (op === 'reboot-bootloader') {
    return { args: ['reboot-bootloader'] };
  }

  if (op === 'reboot-fastboot') {
    return { args: ['reboot', 'fastboot'] };
  }

  if (op === 'boot') {
    if (!fileName) {
      throw new Error('boot step is missing filename.');
    }
    const resolvedFilePath = await resolveStepFilePath(extractDir, fileName, fileIndex);
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ['boot', fastbootPath] };
  }

  if (op === 'continue') {
    return { args: ['continue'] };
  }

  if (op === 'set_active' || op === 'set-active') {
    const slot = (attrs.slot || attrs.var || attrs.value || '').trim();
    if (!slot) {
      throw new Error('set_active step is missing slot value.');
    }
    return { args: ['set_active', slot] };
  }

  if (op === 'update') {
    if (!fileName) {
      throw new Error('update step is missing filename.');
    }
    const resolvedFilePath = await resolveStepFilePath(extractDir, fileName, fileIndex);
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ['update', fastbootPath] };
  }

  if (
    op === 'if' ||
    op === 'ifnot' ||
    op === 'endif' ||
    op === 'assert' ||
    op === 'check' ||
    op === 'note' ||
    op === 'sleep' ||
    op === 'wait-for-device' ||
    op === 'wait_for_device' ||
    op === 'nop' ||
    op === 'cmd' ||
    op === 'run' ||
    op === 'download' ||
    op === 'delete'
  ) {
    return { args: null, skipReason: `skip non-fastboot operation: ${op}` };
  }

  return { args: null, skipReason: `skip unknown operation: ${op}` };
}

export async function pickFlashScript(
  extractDir: string,
  dataReset: 'yes' | 'no',
  recipeHints?: RescueRecipeHints,
) {
  const allFiles = await collectFilesRecursive(extractDir);
  const xmlCandidates = allFiles.filter((candidate) => extname(candidate).toLowerCase() === '.xml');
  if (xmlCandidates.length === 0) {
    throw new Error('No XML flash script found in extracted firmware package.');
  }

  let best:
    | {
        scriptPath: string;
        steps: XmlStep[];
        score: number;
      }
    | undefined;

  for (const candidate of xmlCandidates) {
    const xmlText = await Bun.file(candidate).text();
    const steps = parseXmlSteps(xmlText);
    if (steps.length === 0) {
      continue;
    }
    const score = xmlScriptPriority(candidate, dataReset, recipeHints) * 1000 + steps.length;
    if (!best || score > best.score) {
      best = { scriptPath: candidate, steps, score };
    }
  }

  if (!best || best.steps.length === 0) {
    throw new Error('No usable XML flash instructions found (<step ...> or direct flash tags).');
  }

  return best;
}

export async function extractFastbootCommandsFromScript(
  scriptText: string,
  dataReset: 'yes' | 'no',
  workDir: string,
  fileIndex: Map<string, string[]>,
) {
  const commands: PreparedFastbootCommand[] = [];
  const lines = scriptText.split(/\r?\n/);

  for (const originalLine of lines) {
    let line = originalLine.trim();
    if (!line) continue;
    if (
      line.startsWith('::') ||
      line.startsWith('#') ||
      /^rem\s/i.test(line) ||
      /^echo\s/i.test(line)
    ) {
      continue;
    }

    line = line.replace(/^@+/, '').trim();
    line = line.replace(/["']?%~dp0["']?/gi, '').trim();
    line = line.replace(/["']?%CD%["']?/gi, '').trim();
    if (!line) continue;

    const tokens = parseCommandTokens(line);
    if (tokens.length === 0) continue;

    const fastbootIndex = tokens.findIndex((token) =>
      /(?:^|[\\/])(?:m?fastboot(?:\.exe)?)$/i.test(token),
    );
    if (fastbootIndex < 0) {
      continue;
    }

    const args = tokens.slice(fastbootIndex + 1).map((token) => token.replace(/\\+/g, '/'));
    if (args.length === 0) continue;

    if (shouldSkipForDataReset(args, dataReset)) {
      continue;
    }

    const resolvedArgs = await maybeResolveCommandFileArgument(args, workDir, fileIndex);
    commands.push({
      args: resolvedArgs,
      label: formatFastbootArgs(resolvedArgs),
      softFail: shouldIgnoreFastbootCommandResult(resolvedArgs),
      timeoutMs: resolveFastbootCommandTimeoutMs(resolvedArgs),
    });
  }

  return commands;
}

export async function prepareCommandsFromXml(
  steps: XmlStep[],
  dataReset: 'yes' | 'no',
  workDir: string,
  fileIndex: Map<string, string[]>,
) {
  const commands: PreparedFastbootCommand[] = [];
  const warnings: string[] = [];

  for (const step of steps) {
    try {
      const built = await buildFastbootArgsForStep(step, dataReset, workDir, fileIndex);
      if (!built.args) {
        if (built.skipReason) {
          warnings.push(built.skipReason);
        }
        continue;
      }

      const resolvedArgs = await maybeResolveCommandFileArgument(built.args, workDir, fileIndex);
      commands.push({
        args: resolvedArgs,
        label: formatFastbootArgs(resolvedArgs),
        softFail: shouldIgnoreFastbootCommandResult(resolvedArgs),
        timeoutMs: resolveFastbootCommandTimeoutMs(resolvedArgs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(message);
    }
  }

  return { commands, warnings };
}

function commandScriptPriority(
  filePath: string,
  dataReset: 'yes' | 'no',
  recipeHints?: RescueRecipeHints,
) {
  const lowerName = basename(filePath).toLowerCase();
  let score = 0;
  if (lowerName.includes('servicefile')) {
    score += dataReset === 'no' ? 90 : 30;
  }
  if (lowerName.includes('flashfile')) {
    score += dataReset === 'yes' ? 90 : 40;
  }
  if (lowerName.includes('flashall')) {
    score += 70;
  }
  if (lowerName.endsWith('.bat')) {
    score += 10;
  }
  if (lowerName.endsWith('.sh')) {
    score += 8;
  }
  if (recipeHints?.preferredFileNames.has(lowerName)) {
    score += 250;
  }
  return score;
}

export async function pickScriptCommands(
  extractDir: string,
  allFiles: string[],
  dataReset: 'yes' | 'no',
  fileIndex: Map<string, string[]>,
  recipeHints?: RescueRecipeHints,
) {
  const candidates = allFiles.filter((filePath) => {
    const lowerName = basename(filePath).toLowerCase();
    if (!lowerName.endsWith('.bat') && !lowerName.endsWith('.sh')) {
      return false;
    }
    return (
      lowerName.includes('flash') || lowerName.includes('service') || lowerName.includes('rescue')
    );
  });

  let best:
    | {
        scriptPath: string;
        commands: PreparedFastbootCommand[];
        score: number;
      }
    | undefined;

  for (const candidate of candidates) {
    const scriptText = await Bun.file(candidate).text();
    const commands = await extractFastbootCommandsFromScript(
      scriptText,
      dataReset,
      extractDir,
      fileIndex,
    );
    if (commands.length === 0) {
      continue;
    }
    const score = commandScriptPriority(candidate, dataReset, recipeHints) * 1000 + commands.length;
    if (!best || score > best.score) {
      best = { scriptPath: candidate, commands, score };
    }
  }

  return best;
}

export function xmlScriptPriority(
  scriptPath: string,
  dataReset: 'yes' | 'no',
  recipeHints?: RescueRecipeHints,
) {
  const lowerName = basename(scriptPath).toLowerCase();
  let score = 0;
  if (lowerName.includes('rawprogram_unsparse_clean_carrier')) {
    score += dataReset === 'no' ? 20 : 95;
  } else if (lowerName.includes('rawprogram_unsparse')) {
    score += dataReset === 'no' ? 140 : 110;
  } else if (lowerName.includes('rawprogram0_clean_carrier')) {
    score += dataReset === 'no' ? 15 : 80;
  } else if (lowerName.includes('rawprogram')) {
    score += 65;
  }
  if (lowerName.includes('servicefile')) {
    score += dataReset === 'no' ? 90 : 30;
  }
  if (lowerName.includes('flashfile')) {
    score += dataReset === 'yes' ? 90 : 40;
  }
  if (lowerName.includes('softwareupgrade')) {
    score += dataReset === 'no' ? 55 : 35;
  }
  if (lowerName.includes('flashinfo')) {
    score += 45;
  }
  if (lowerName.includes('efuse')) {
    score += 35;
  }
  if (lowerName.includes('lkbin')) {
    score += 35;
  }
  if (lowerName.includes('_cfc')) {
    score += 70;
  }
  if (lowerName.includes('loadinfo')) {
    score -= 60;
  }
  if (lowerName.includes('_online_')) {
    score -= 30;
  }
  if (lowerName.endsWith('.xml')) {
    score += 10;
  }
  if (recipeHints?.preferredFileNames.has(lowerName)) {
    score += 250;
  }
  return score;
}
