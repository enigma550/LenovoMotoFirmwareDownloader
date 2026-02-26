import { parseCommandTokens } from '../../../firmware-package-utils.ts';

const fastbootOperationTimeoutMsByName: Record<string, number> = {
  continue: 10000,
  erase: 60000,
  flash: 300000,
  flashall: 600000,
  format: 60000,
  getvar: 20000,
  oem: 60000,
  reboot: 20000,
  'reboot-bootloader': 10000,
};

const defaultFastbootIgnoreResultCommandRules = ['getvar max-sparse-size'] as const;
const defaultUnisocPacToolCandidates = [
  'upgrade_tool',
  'upgrade_tool.exe',
  'CmdDloader',
  'CmdDloader.exe',
  'LXConsoleDownLoadTool',
  'LXConsoleDownLoadTool.exe',
] as const;

export const defaultFastbootCommandTimeoutMs = 120000;
export const defaultQdlCommandTimeoutMs = 30 * 60 * 1000;
export const defaultUnisocCommandTimeoutMs = 45 * 60 * 1000;

function normalizeFastbootCommandPart(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFastbootCommandFromText(text: string) {
  return text
    .split(/\s+/)
    .map((part) => normalizeFastbootCommandPart(part))
    .filter(Boolean);
}

function normalizeFastbootCommandFromArgs(args: string[]) {
  return args.map((part) => normalizeFastbootCommandPart(part)).filter(Boolean);
}

function startsWithCommandRule(commandParts: string[], ruleParts: string[]) {
  if (ruleParts.length === 0 || commandParts.length < ruleParts.length) {
    return false;
  }
  for (let index = 0; index < ruleParts.length; index += 1) {
    if (commandParts[index] !== ruleParts[index]) {
      return false;
    }
  }
  return true;
}

export function resolveFastbootCommandTimeoutMs(args: string[]) {
  const commandParts = normalizeFastbootCommandFromArgs(args);
  const operation = commandParts[0] || '';
  return fastbootOperationTimeoutMsByName[operation] || defaultFastbootCommandTimeoutMs;
}

export function shouldIgnoreFastbootCommandResult(
  args: string[],
  ignoreRules: readonly string[] = defaultFastbootIgnoreResultCommandRules,
) {
  const commandParts = normalizeFastbootCommandFromArgs(args);
  if (commandParts.length === 0) {
    return false;
  }

  for (const ruleText of ignoreRules) {
    const ruleParts = normalizeFastbootCommandFromText(ruleText);
    if (startsWithCommandRule(commandParts, ruleParts)) {
      return true;
    }
  }

  return false;
}

function splitCommandList(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function deduplicatePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function resolveUnisocPacToolCandidates() {
  const configuredSingleTool = Bun.env.RESCUE_UNISOC_TOOL || process.env.RESCUE_UNISOC_TOOL || '';
  if (configuredSingleTool.trim()) {
    return [configuredSingleTool.trim()];
  }

  const configuredToolList =
    Bun.env.RESCUE_UNISOC_TOOL_CANDIDATES || process.env.RESCUE_UNISOC_TOOL_CANDIDATES || '';
  if (configuredToolList.trim()) {
    return deduplicatePreserveOrder(splitCommandList(configuredToolList));
  }

  return [...defaultUnisocPacToolCandidates];
}

export function resolveUnisocPacCommandArgs(pacPath: string) {
  const configuredArgsTemplate =
    Bun.env.RESCUE_UNISOC_PAC_ARGS || process.env.RESCUE_UNISOC_PAC_ARGS || '';
  if (!configuredArgsTemplate.trim()) {
    return [pacPath];
  }

  const parsedTemplateArgs = parseCommandTokens(configuredArgsTemplate);
  if (parsedTemplateArgs.length === 0) {
    return [pacPath];
  }

  const replacedArgs = parsedTemplateArgs.map((part) =>
    part.replace(/\{pacPath\}|\{pac\}/g, pacPath),
  );
  if (!replacedArgs.some((part) => part.includes(pacPath))) {
    replacedArgs.push(pacPath);
  }
  return replacedArgs;
}
