/**
 * EDL rawprogram/patch XML picking and QDL storage auto-detection.
 * Selects the best rawprogram/patch XML files and determines storage type.
 */
import { basename } from 'node:path';
import { isWipeSensitivePartition } from '../../../../firmware-package-utils.ts';
import { parseAttributes, type ResolvedQdlStorage } from './edl-programmer-resolver.ts';

export type RawprogramPickResult = {
  rawprogramPath: string;
  hadCandidates: boolean;
  rejectionReason?: string;
};

function rawprogramXmlPriority(
  scriptPath: string,
  dataReset: 'yes' | 'no',
  recipePreferredFileNames?: Set<string>,
) {
  const lowerName = basename(scriptPath).toLowerCase();
  let score = 0;

  if (recipePreferredFileNames?.has(lowerName)) {
    score += 400;
  }

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

  return score;
}

function normalizeRawprogramHint(value: string) {
  const normalized = basename(value.replace(/\\/g, '/')).toLowerCase().trim();
  return normalized.replace(/\.[^.]+$/g, '');
}

function collectRawprogramHints(attrs: Record<string, string>) {
  const hints: string[] = [];
  const keys = [
    'label',
    'partition',
    'partname',
    'partition_name',
    'filename',
    'file',
    'file_name',
    'path',
  ] as const;
  for (const key of keys) {
    const value = (attrs[key] || '').trim();
    if (!value) {
      continue;
    }
    hints.push(value);
  }
  return hints;
}

export function analyzeRawprogramDataResetSafety(rawprogramText: string) {
  const sensitiveTargets = new Set<string>();
  const nodeRegex = /<(program|erase|zeroout|patch)\b([^>]*?)\/?>/gi;
  let match = nodeRegex.exec(rawprogramText);
  while (match !== null) {
    const attrs = parseAttributes(match[2] || '');
    const hints = collectRawprogramHints(attrs);
    for (const hint of hints) {
      const normalized = normalizeRawprogramHint(hint);
      if (!normalized) {
        continue;
      }
      if (isWipeSensitivePartition(normalized)) {
        sensitiveTargets.add(normalized);
        continue;
      }
      if (
        normalized.includes('userdata') ||
        normalized.includes('cache') ||
        normalized.includes('metadata')
      ) {
        sensitiveTargets.add(normalized);
      }
    }
    match = nodeRegex.exec(rawprogramText);
  }

  return {
    isSafeForDataResetNo: sensitiveTargets.size === 0,
    sensitiveTargets: [...sensitiveTargets],
  };
}

export function analyzePatchDataResetSafety(patchText: string) {
  const lower = patchText.toLowerCase();
  const matches = lower.match(/\b(?:userdata|cache|metadata)\b/g) || [];
  const sensitiveTargets = [...new Set(matches)];
  return {
    isSafeForDataResetNo: sensitiveTargets.length === 0,
    sensitiveTargets,
  };
}

export async function pickBestRawprogram(options: {
  extractedFiles: string[];
  dataReset: 'yes' | 'no';
  preferredFileNames?: Set<string>;
}): Promise<RawprogramPickResult> {
  const candidates = options.extractedFiles.filter((filePath) => {
    const lowerName = basename(filePath).toLowerCase();
    return lowerName.endsWith('.xml') && lowerName.startsWith('rawprogram');
  });
  if (candidates.length === 0) {
    return { rawprogramPath: '', hadCandidates: false };
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: rawprogramXmlPriority(candidate, options.dataReset, options.preferredFileNames) * 1000,
    }))
    .sort((left, right) => right.score - left.score);

  if (options.dataReset !== 'no') {
    return { rawprogramPath: ranked[0]?.candidate || '', hadCandidates: true };
  }

  const rejected: string[] = [];
  for (const entry of ranked) {
    try {
      const text = await Bun.file(entry.candidate).text();
      const analysis = analyzeRawprogramDataResetSafety(text);
      if (analysis.isSafeForDataResetNo) {
        return { rawprogramPath: entry.candidate, hadCandidates: true };
      }
      const sensitive =
        analysis.sensitiveTargets.slice(0, 3).join(', ') || 'wipe-sensitive targets';
      rejected.push(`${basename(entry.candidate)} [${sensitive}]`);
    } catch {
      rejected.push(`${basename(entry.candidate)} [unreadable]`);
    }
  }

  return {
    rawprogramPath: '',
    hadCandidates: true,
    rejectionReason:
      'Data reset = no for QDL requires a rawprogram XML that does not touch userdata/cache/metadata. None matched: ' +
      rejected.slice(0, 3).join('; '),
  };
}

function isWipeLikePatchFile(filePath: string) {
  const lowerName = basename(filePath).toLowerCase();
  return lowerName.includes('blank') || lowerName.includes('wipe') || lowerName.includes('erase');
}

function patchOrderValue(filePath: string) {
  const lower = basename(filePath)
    .toLowerCase()
    .replace(/\.xml$/g, '');
  const digitText = lower.replace(/\D+/g, '');
  const index = Number.parseInt(digitText, 10);
  return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

function sortPatchCandidates(candidates: string[]) {
  return [...candidates].sort((left, right) => {
    const leftNumber = patchOrderValue(left);
    const rightNumber = patchOrderValue(right);
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return basename(left).localeCompare(basename(right));
  });
}

function findMatchingPatchCandidate(rawprogramPath: string, candidates: string[]) {
  const rawName = basename(rawprogramPath).toLowerCase();
  if (!rawName.startsWith('rawprogram') || !rawName.endsWith('.xml')) {
    return '';
  }
  const directName = rawName.replace('rawprogram', 'patch');
  const direct = candidates.find((candidate) => basename(candidate).toLowerCase() === directName);
  if (direct) {
    return direct;
  }
  const rawSuffix = rawName.replace(/^rawprogram/, '').replace(/\.xml$/g, '');
  if (!rawSuffix) {
    return '';
  }
  return (
    candidates.find((candidate) => {
      const candidateName = basename(candidate)
        .toLowerCase()
        .replace(/\.xml$/g, '');
      return candidateName === `patch${rawSuffix}`;
    }) || ''
  );
}

export function pickPatchXml(options: {
  extractedFiles: string[];
  rawprogramPath: string;
  preferredFileNames?: Set<string>;
}) {
  const allCandidates = options.extractedFiles.filter((filePath) => {
    const lowerName = basename(filePath).toLowerCase();
    return lowerName.endsWith('.xml') && lowerName.startsWith('patch');
  });
  if (allCandidates.length === 0) {
    return '';
  }

  const safeCandidates = allCandidates.filter((candidate) => !isWipeLikePatchFile(candidate));
  const rankedPrimary = sortPatchCandidates(
    safeCandidates.length > 0 ? safeCandidates : allCandidates,
  ).sort((left, right) => {
    const leftPreferred = options.preferredFileNames?.has(basename(left).toLowerCase()) ? 1 : 0;
    const rightPreferred = options.preferredFileNames?.has(basename(right).toLowerCase()) ? 1 : 0;
    if (leftPreferred !== rightPreferred) {
      return rightPreferred - leftPreferred;
    }
    return 0;
  });
  const exactPrimary = findMatchingPatchCandidate(options.rawprogramPath, rankedPrimary);
  if (exactPrimary) {
    return exactPrimary;
  }
  const exactAll = findMatchingPatchCandidate(options.rawprogramPath, allCandidates);
  if (exactAll && safeCandidates.length === 0) {
    return exactAll;
  }
  return rankedPrimary[0] || '';
}

export function addStorageScoreFromText(
  text: string,
  scores: { emmc: number; ufs: number },
  weight = 1,
) {
  if (!text) {
    return;
  }
  const lower = text.toLowerCase();

  if (/memoryname\s*=\s*["']ufs["']/.test(lower)) {
    scores.ufs += 80 * weight;
  }
  if (/memoryname\s*=\s*["']emmc["']/.test(lower)) {
    scores.emmc += 80 * weight;
  }
  if (/\bprog_ufs\b|ufs_firehose|firehose_ufs/.test(lower)) {
    scores.ufs += 40 * weight;
  }
  if (/\bprog_emmc\b|emmc_firehose|firehose_emmc/.test(lower)) {
    scores.emmc += 40 * weight;
  }
  if (/(?:^|[^a-z0-9])ufs(?:[^a-z0-9]|$)/.test(lower)) {
    scores.ufs += 4 * weight;
  }
  if (/(?:^|[^a-z0-9])emmc(?:[^a-z0-9]|$)/.test(lower)) {
    scores.emmc += 4 * weight;
  }
}

export function resolveAutoQdlStorage(options: {
  requestedStorage: 'auto' | 'emmc' | 'ufs';
  programmerPath: string;
  rawprogramPath: string;
  loadInfoText?: string;
  rawprogramText?: string;
}): ResolvedQdlStorage {
  if (options.requestedStorage === 'emmc' || options.requestedStorage === 'ufs') {
    return options.requestedStorage;
  }

  const scores = { emmc: 0, ufs: 0 };
  addStorageScoreFromText(basename(options.programmerPath), scores, 5);
  addStorageScoreFromText(basename(options.rawprogramPath), scores, 4);
  addStorageScoreFromText(options.loadInfoText || '', scores, 2);
  addStorageScoreFromText(options.rawprogramText || '', scores, 3);

  return scores.ufs > scores.emmc ? 'ufs' : 'emmc';
}

export function resolveProgrammerSelectionStorageHint(options: {
  requestedStorage: 'auto' | 'emmc' | 'ufs';
  rawprogramPath: string;
  loadInfoText?: string;
  rawprogramText?: string;
}): ResolvedQdlStorage | undefined {
  if (options.requestedStorage === 'emmc' || options.requestedStorage === 'ufs') {
    return options.requestedStorage;
  }

  const scores = { emmc: 0, ufs: 0 };
  addStorageScoreFromText(basename(options.rawprogramPath), scores, 4);
  addStorageScoreFromText(options.loadInfoText || '', scores, 3);
  addStorageScoreFromText(options.rawprogramText || '', scores, 4);

  if (scores.emmc === 0 && scores.ufs === 0) {
    return undefined;
  }
  if (scores.emmc === scores.ufs) {
    return undefined;
  }
  return scores.ufs > scores.emmc ? 'ufs' : 'emmc';
}
