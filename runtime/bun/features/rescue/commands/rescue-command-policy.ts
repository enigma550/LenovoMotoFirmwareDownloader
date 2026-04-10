import { parseCommandTokens } from '../../../firmware-package-utils.ts';

const defaultUnisocPacToolCandidates = ['spd-tool', 'spd-tool.exe'] as const;
export const defaultFastbootCommandTimeoutMs = 30 * 60 * 1000;
export const defaultFastbootReconnectTimeoutMs = 2 * 60 * 1000;
export const defaultQdlCommandTimeoutMs = 30 * 60 * 1000;
export const defaultUnisocCommandTimeoutMs = 45 * 60 * 1000;

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
    return ['flash', pacPath];
  }

  const parsedTemplateArgs = parseCommandTokens(configuredArgsTemplate);
  if (parsedTemplateArgs.length === 0) {
    return ['flash', pacPath];
  }

  const replacedArgs = parsedTemplateArgs.map((part) =>
    part.replace(/\{pacPath\}|\{pac\}/g, pacPath),
  );
  if (!replacedArgs.some((part) => part.includes(pacPath))) {
    replacedArgs.push(pacPath);
  }
  return replacedArgs;
}

export function resolveFastbootSerial() {
  const configured = Bun.env.RESCUE_FASTBOOT_SERIAL || process.env.RESCUE_FASTBOOT_SERIAL || '';
  return configured.trim() || undefined;
}

export function resolveFastbootReconnectTimeoutMs() {
  const configured =
    Bun.env.RESCUE_FASTBOOT_RECONNECT_TIMEOUT_MS ||
    process.env.RESCUE_FASTBOOT_RECONNECT_TIMEOUT_MS ||
    '';
  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultFastbootReconnectTimeoutMs;
}
