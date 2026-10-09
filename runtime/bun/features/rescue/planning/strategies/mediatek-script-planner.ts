import { basename } from 'node:path';
import {
  formatFastbootArgs,
  maybeResolveCommandFileArgument,
  normalizePathForLookup,
  shouldSkipForDataReset,
} from '../../../../firmware-package-utils.ts';
import { defaultFastbootCommandTimeoutMs } from '../../commands/rescue-command-policy.ts';
import type { PreparedFastbootCommand } from '../../commands/rescue-command-types.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';
import type {
  RescueCommandPlanCandidate,
  RescueCommandPlanContext,
} from '../command-planner-types.ts';

const KNOWN_MEDIATEK_SCRIPT_NAMES = new Set(['flashall.sh', 'cfc_flash.bat', 'flashall.bat']);

function isMediaTekScriptName(name: string) {
  return KNOWN_MEDIATEK_SCRIPT_NAMES.has(name.toLowerCase());
}

function isScatterFileName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes('scatter') && (lower.endsWith('.xml') || lower.endsWith('.txt'));
}

function cleanScriptToken(token: string) {
  let cleaned = token.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.replace(/^(\$dp0|%~dp0|[a-zA-Z]:|\.\/|\.\\)[/\\]+/i, '');
  return cleaned;
}

function parseScriptCommandLine(rawLine: string): string[] | null {
  const line = rawLine.trim();
  if (
    !line ||
    line.startsWith('#') ||
    line.startsWith('rem ') ||
    line.startsWith('::') ||
    line.startsWith('echo ') ||
    line.toLowerCase().includes('boot_debug') ||
    line.includes('-debug.img')
  ) {
    return null;
  }

  if (
    !line.includes('$FASTBOOT') &&
    !line.includes('%FASTBOOT%') &&
    !line.toLowerCase().includes('fastboot')
  ) {
    return null;
  }

  const match = line.match(/(?:\$FASTBOOT|%FASTBOOT%|fastboot(?:\.exe)?)\s+(.*)/i);
  if (!match?.[1]) {
    return null;
  }

  const remainder = match[1]
    .replace(/\|\|.*$/, '')
    .replace(/&&.*$/, '')
    .replace(/>.*$/, '')
    .trim();

  const tokenRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const rawTokens: string[] = [];
  for (const tokenMatch of remainder.matchAll(tokenRegex)) {
    const raw = tokenMatch[0];
    if (raw) rawTokens.push(raw);
  }

  const args: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i] || '';
    if (token === '-s' || token === '/s') {
      i++; // Skip serial argument
      continue;
    }
    if (
      token === '$SERIAL_NUMBER' ||
      token === '%SERIAL_NUMBER%' ||
      token === '$1' ||
      token === '%1' ||
      token === '%*' ||
      token === '$*'
    ) {
      continue;
    }

    const cleaned = cleanScriptToken(token);
    if (cleaned) {
      args.push(cleaned);
    }
  }

  if (args.length === 0) {
    return null;
  }

  const verb = (args[0] || '').toLowerCase();
  const knownVerbs = new Set([
    'flash',
    'erase',
    'format',
    'oem',
    'set_active',
    'set-active',
    'reboot',
    'boot',
  ]);
  if (!knownVerbs.has(verb)) {
    return null;
  }

  return args;
}

function extractScriptBody(content: string): string {
  const shellFnMatch = content.match(
    /(?:function\s+flash_process|flash_process\s*\(\))\s*\{([\s\S]*?)\n\}/i,
  );
  if (shellFnMatch?.[1]) {
    return shellFnMatch[1];
  }

  const batchLabelMatch = content.match(
    /^[ \t]*:flash_process\b([\s\S]*?)(?:^[ \t]*:[a-z0-9_]+|z)/im,
  );
  if (batchLabelMatch?.[1]) {
    return batchLabelMatch[1];
  }

  return content;
}

function isPreloaderHardwarePartition(args: string[]) {
  const verb = (args[0] || '').toLowerCase();
  if (verb !== 'flash') return false;
  // If args are ['flash', '-S', '1G', 'partition', 'file']
  const partitionIndex = args[1] === '-S' ? 3 : 1;
  const partition = (args[partitionIndex] || '').toLowerCase().trim();
  return partition === 'boot0' || partition === 'boot1' || partition === 'preloader';
}

export const mediatekScriptPlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'mediatek-script',
  priority: 130,
  async plan(context: RescueCommandPlanContext): Promise<RescueCommandPlanCandidate | null> {
    const scriptCandidates: string[] = [];
    let scatterFound = false;

    for (const filePath of context.extractedFiles) {
      const fileName = basename(filePath);
      if (isMediaTekScriptName(fileName)) {
        scriptCandidates.push(filePath);
      } else if (isScatterFileName(fileName)) {
        scatterFound = true;
      }
    }

    if (scriptCandidates.length === 0 && !scatterFound) {
      return null;
    }

    const chosenScriptPath =
      scriptCandidates.find((path) => basename(path).toLowerCase() === 'flashall.sh') ||
      scriptCandidates.find((path) => basename(path).toLowerCase() === 'cfc_flash.bat') ||
      scriptCandidates.find((path) => basename(path).toLowerCase() === 'flashall.bat') ||
      scriptCandidates[0];

    const warnings: string[] = [];
    const commands: PreparedFastbootCommand[] = [];

    if (chosenScriptPath) {
      const scriptName = basename(chosenScriptPath);
      let content = '';
      try {
        content = await Bun.file(chosenScriptPath).text();
      } catch (error) {
        warnings.push(`Failed to read MediaTek script ${scriptName}: ${String(error)}`);
        return null;
      }

      const bodyText = extractScriptBody(content);
      const lines = bodyText.split(/\r?\n/);

      for (const line of lines) {
        const parsedArgs = parseScriptCommandLine(line);
        if (!parsedArgs || parsedArgs.length === 0) {
          continue;
        }

        let resolvedArgs = parsedArgs.slice();
        if (resolvedArgs.length >= 2) {
          resolvedArgs = await maybeResolveCommandFileArgument(
            resolvedArgs,
            context.workDir,
            context.fileIndex,
          );
        }

        if (shouldSkipForDataReset(resolvedArgs, context.dataReset)) {
          warnings.push(
            `Skipped wipe-sensitive Fastboot step: ${formatFastbootArgs(resolvedArgs)}`,
          );
          continue;
        }

        const normalizedArgs = resolvedArgs.map((part, index) =>
          index >= 2 ? normalizePathForLookup(part) || part : part,
        );

        const isSoftFail = isPreloaderHardwarePartition(normalizedArgs);
        const isSuperImage = normalizedArgs.some((arg) => arg.toLowerCase().includes('super'));
        const timeoutMs = isSuperImage ? 600000 : defaultFastbootCommandTimeoutMs;

        commands.push({
          tool: 'fastboot',
          label: formatFastbootArgs(normalizedArgs),
          softFail: isSoftFail,
          timeoutMs,
          args: normalizedArgs,
        });
      }

      if (commands.length > 0) {
        return {
          plannerId: 'mediatek-script',
          plannerPriority: 130,
          commandSource: `mediatek:${scriptName}`,
          sourceFileName: scriptName,
          commands,
          warnings,
        };
      }
    }

    return null;
  },
};
