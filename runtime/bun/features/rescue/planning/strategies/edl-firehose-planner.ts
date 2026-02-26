import { mkdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
  collectFilesRecursive,
  isWipeSensitivePartition,
  sanitizeDirectoryName,
} from '../../../../firmware-package-utils.ts';
import { defaultQdlCommandTimeoutMs } from '../../commands/rescue-command-policy.ts';
import { getFirmwareArchiveExtension } from '../../extractors/archive-format.ts';
import { extractFirmwareArchive } from '../../extractors/extract-firmware-archive.ts';
import { xmlScriptPriority } from '../../fastboot-parser.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';

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

function normalizeLookupPath(value: string) {
  return value.replace(/\\/g, '/').toLowerCase();
}

function resolveFirehoseProgrammerFromLoadInfo(options: {
  loadInfoText: string;
  extractedFiles: string[];
}) {
  const imageRegex = /<image\b([^>]*?)\/?>/gi;
  let match = imageRegex.exec(options.loadInfoText);
  while (match !== null) {
    const attrs = parseAttributes(match[1] || '');
    const isProgrammer =
      (attrs.programmer || '').toLowerCase() === 'true' || attrs.programmer === '1';
    if (!isProgrammer) {
      match = imageRegex.exec(options.loadInfoText);
      continue;
    }

    const imagePath = attrs.image_path || attrs.imagepath || '';
    if (!imagePath.trim()) {
      match = imageRegex.exec(options.loadInfoText);
      continue;
    }

    const normalizedImagePath = normalizeLookupPath(imagePath);
    const imageFileName = basename(normalizedImagePath);
    const exact = options.extractedFiles.find((candidatePath) => {
      const candidateNormalized = normalizeLookupPath(candidatePath);
      return (
        candidateNormalized.endsWith(`/${normalizedImagePath}`) ||
        basename(candidateNormalized) === imageFileName
      );
    });
    if (exact) {
      return exact;
    }
    match = imageRegex.exec(options.loadInfoText);
  }

  return '';
}

function findProgrammerImagePathsFromLoadInfo(loadInfoText: string) {
  const imageRegex = /<image\b([^>]*?)\/?>/gi;
  const programmerPaths: string[] = [];
  let match = imageRegex.exec(loadInfoText);
  while (match !== null) {
    const attrs = parseAttributes(match[1] || '');
    const isProgrammer =
      (attrs.programmer || '').toLowerCase() === 'true' || attrs.programmer === '1';
    if (!isProgrammer) {
      match = imageRegex.exec(loadInfoText);
      continue;
    }

    const imagePath = (attrs.image_path || attrs.imagepath || '').trim();
    if (!imagePath) {
      match = imageRegex.exec(loadInfoText);
      continue;
    }

    programmerPaths.push(imagePath);
    match = imageRegex.exec(loadInfoText);
  }

  return programmerPaths;
}

function inferProgrammerStorageFromText(text: string): ResolvedQdlStorage | null {
  const lower = text.toLowerCase();
  if (/\bprog_ufs\b|ufs_firehose|firehose_ufs|\bufs\b/.test(lower)) {
    return 'ufs';
  }
  if (/\bprog_emmc\b|emmc_firehose|firehose_emmc|\bemmc\b/.test(lower)) {
    return 'emmc';
  }
  return null;
}

function programmerCandidatePriority(options: {
  filePath: string;
  preferredFileNames: Set<string>;
  preferredStorage?: ResolvedQdlStorage;
}) {
  const { filePath, preferredFileNames, preferredStorage } = options;
  const lowerName = basename(filePath).toLowerCase();
  let score = 0;

  if (preferredFileNames.has(lowerName)) {
    score += 10_000;
  }

  // Standard Qualcomm flashing should prefer firehose programmers over legacy MPRG loaders.
  if (lowerName.includes('prog_ufs_firehose')) {
    score += 1_000;
  } else if (lowerName.includes('prog_emmc_firehose')) {
    score += 1_000;
  } else if (lowerName.includes('firehose')) {
    score += 800;
  } else if (lowerName.startsWith('prog_')) {
    score += 700;
  } else if (lowerName.startsWith('mprg')) {
    score += 500;
  }

  if (lowerName.endsWith('.mbn')) {
    score += 200;
  } else if (lowerName.endsWith('.elf')) {
    score += 120;
  } else if (lowerName.endsWith('.bin')) {
    score += 80;
  }

  if (lowerName.includes('ddr')) {
    score += 75;
  }

  if (preferredStorage) {
    const candidateStorage = inferProgrammerStorageFromText(lowerName);
    if (candidateStorage === preferredStorage) {
      score += 350;
    } else if (candidateStorage && candidateStorage !== preferredStorage) {
      score -= 400;
    }
  }

  // Only prefer validated loaders when explicitly needed (VIP flow).
  if (lowerName.includes('validated')) {
    score -= 150;
  }

  return score;
}

function findFirehoseProgrammer(options: {
  extractedFiles: string[];
  preferredProgrammerPaths?: string[];
  preferredStorage?: ResolvedQdlStorage;
}) {
  const { extractedFiles, preferredProgrammerPaths = [], preferredStorage } = options;
  const preferredFileNames = new Set(
    preferredProgrammerPaths.map((value) => basename(normalizeLookupPath(value))).filter(Boolean),
  );
  const ranked = extractedFiles
    .filter((filePath) => {
      const lowerName = basename(filePath).toLowerCase();
      return (
        /firehose.*\.(mbn|elf|bin)$/.test(lowerName) ||
        /^(mprg|prog_).*\.(mbn|elf|bin)$/.test(lowerName)
      );
    })
    .sort((left, right) => {
      const leftName = basename(left).toLowerCase();
      const rightName = basename(right).toLowerCase();
      const leftScore = programmerCandidatePriority({
        filePath: left,
        preferredFileNames,
        preferredStorage,
      });
      const rightScore = programmerCandidatePriority({
        filePath: right,
        preferredFileNames,
        preferredStorage,
      });
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return leftName.length - rightName.length;
    });

  return ranked[0] || '';
}

function shouldExtractArchiveForProgrammer(options: {
  filePath: string;
  preferredProgrammerPaths: string[];
}) {
  const archiveExt = getFirmwareArchiveExtension(options.filePath);
  if (!archiveExt) {
    return false;
  }

  const lowerName = basename(options.filePath).toLowerCase();
  if (
    lowerName.includes('firehose') ||
    lowerName.includes('prog_') ||
    lowerName.includes('mprg') ||
    lowerName.includes('.elf.') ||
    lowerName.includes('.mbn.')
  ) {
    return true;
  }

  const normalizedArchiveName = normalizeLookupPath(lowerName);
  return options.preferredProgrammerPaths.some((preferredPath) => {
    const preferredName = basename(normalizeLookupPath(preferredPath));
    if (!preferredName) {
      return false;
    }
    const loweredPreferred = preferredName.toLowerCase();
    return (
      normalizedArchiveName.includes(loweredPreferred) ||
      normalizedArchiveName.includes(`${loweredPreferred}.`)
    );
  });
}

async function extractNestedProgrammerArchives(options: {
  archivePaths: string[];
  workDir: string;
}) {
  const nestedRoots: string[] = [];
  for (const archivePath of options.archivePaths) {
    const targetDirName = sanitizeDirectoryName(`nested-${basename(archivePath)}`);
    const extractDir = join(options.workDir, '.nested-programmers', targetDirName);
    await mkdir(extractDir, { recursive: true });

    const existingFiles = await collectFilesRecursive(extractDir);
    if (existingFiles.length > 0) {
      nestedRoots.push(extractDir);
      continue;
    }

    try {
      await extractFirmwareArchive({
        packagePath: archivePath,
        extractDir,
        workingDirectory: options.workDir,
      });
      nestedRoots.push(extractDir);
    } catch {
      // Ignore archive extraction failures and continue scanning other candidates.
    }
  }

  const nestedFiles: string[] = [];
  for (const root of nestedRoots) {
    const files = await collectFilesRecursive(root);
    for (const filePath of files) {
      nestedFiles.push(filePath);
    }
  }
  return nestedFiles;
}

type RawprogramPickResult = {
  rawprogramPath: string;
  hadCandidates: boolean;
  rejectionReason?: string;
};

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

function analyzeRawprogramDataResetSafety(rawprogramText: string) {
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

function analyzePatchDataResetSafety(patchText: string) {
  const lower = patchText.toLowerCase();
  const matches = lower.match(/\b(?:userdata|cache|metadata)\b/g) || [];
  const sensitiveTargets = [...new Set(matches)];
  return {
    isSafeForDataResetNo: sensitiveTargets.length === 0,
    sensitiveTargets,
  };
}

async function pickBestRawprogram(options: {
  extractedFiles: string[];
  dataReset: 'yes' | 'no';
}): Promise<RawprogramPickResult> {
  const candidates = options.extractedFiles.filter((filePath) => {
    const lowerName = basename(filePath).toLowerCase();
    return lowerName.endsWith('.xml') && lowerName.startsWith('rawprogram');
  });
  if (candidates.length === 0) {
    return {
      rawprogramPath: '',
      hadCandidates: false,
    };
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: xmlScriptPriority(candidate, options.dataReset) * 1000,
    }))
    .sort((left, right) => right.score - left.score);

  if (options.dataReset !== 'no') {
    return {
      rawprogramPath: ranked[0]?.candidate || '',
      hadCandidates: true,
    };
  }

  const rejected: string[] = [];
  for (const entry of ranked) {
    try {
      const text = await Bun.file(entry.candidate).text();
      const analysis = analyzeRawprogramDataResetSafety(text);
      if (analysis.isSafeForDataResetNo) {
        return {
          rawprogramPath: entry.candidate,
          hadCandidates: true,
        };
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

function pickPatchXml(options: { extractedFiles: string[]; rawprogramPath: string }) {
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
  );
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

type ResolvedQdlStorage = 'emmc' | 'ufs';

function addStorageScoreFromText(text: string, scores: { emmc: number; ufs: number }, weight = 1) {
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

function resolveAutoQdlStorage(options: {
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

function resolveProgrammerSelectionStorageHint(options: {
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

export const edlFirehosePlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'edl-firehose',
  priority: 120,
  async plan(context) {
    const requestedStorage = context.qdlStorage;
    const serial = context.qdlSerial?.trim() || undefined;
    const rawprogramPick = await pickBestRawprogram({
      extractedFiles: context.extractedFiles,
      dataReset: context.dataReset,
    });
    if (!rawprogramPick.rawprogramPath) {
      if (rawprogramPick.hadCandidates && rawprogramPick.rejectionReason) {
        return {
          plannerId: 'edl-firehose',
          plannerPriority: 120,
          commandSource: 'edl:rawprogram',
          sourceFileName: 'rawprogram.xml',
          commands: [],
          warnings: [rawprogramPick.rejectionReason],
        };
      }
      return null;
    }
    const rawprogramPath = rawprogramPick.rawprogramPath;

    let rawprogramText = '';
    try {
      rawprogramText = await Bun.file(rawprogramPath).text();
    } catch {
      // Ignore parsing hint failures and continue with filename/loadinfo heuristics.
    }

    const patchPath = pickPatchXml({
      extractedFiles: context.extractedFiles,
      rawprogramPath,
    });
    if (context.dataReset === 'no' && patchPath) {
      try {
        const patchText = await Bun.file(patchPath).text();
        const patchSafety = analyzePatchDataResetSafety(patchText);
        if (!patchSafety.isSafeForDataResetNo) {
          return {
            plannerId: 'edl-firehose',
            plannerPriority: 120,
            commandSource: `edl:${basename(rawprogramPath)}`,
            sourceFileName: basename(rawprogramPath),
            commands: [],
            warnings: [
              'Data reset = no for QDL requires patch XML without userdata/cache/metadata references. ' +
                `Rejected ${basename(patchPath)} [${patchSafety.sensitiveTargets.join(', ')}].`,
            ],
          };
        }
      } catch {
        return {
          plannerId: 'edl-firehose',
          plannerPriority: 120,
          commandSource: `edl:${basename(rawprogramPath)}`,
          sourceFileName: basename(rawprogramPath),
          commands: [],
          warnings: [
            `Data reset = no for QDL could not verify patch safety: ${basename(patchPath)} is unreadable.`,
          ],
        };
      }
    }
    const loadInfoPath =
      context.extractedFiles.find(
        (filePath) => basename(filePath).toLowerCase() === 'loadinfo.xml',
      ) || '';

    let allExtractedFiles = [...context.extractedFiles];
    let programmerPath = '';
    let preferredProgrammerPaths: string[] = [];
    let loadInfoText = '';
    if (loadInfoPath) {
      try {
        loadInfoText = await Bun.file(loadInfoPath).text();
        preferredProgrammerPaths = findProgrammerImagePathsFromLoadInfo(loadInfoText);
        programmerPath = resolveFirehoseProgrammerFromLoadInfo({
          loadInfoText,
          extractedFiles: allExtractedFiles,
        });
      } catch {
        // Ignore malformed loadinfo and continue with heuristic lookup.
      }
    }
    const programmerStorageHint = resolveProgrammerSelectionStorageHint({
      requestedStorage,
      rawprogramPath,
      loadInfoText,
      rawprogramText,
    });
    if (!programmerPath) {
      programmerPath = findFirehoseProgrammer({
        extractedFiles: allExtractedFiles,
        preferredProgrammerPaths,
        preferredStorage: programmerStorageHint,
      });
    }
    if (!programmerPath) {
      const nestedArchiveCandidates = allExtractedFiles.filter((filePath) =>
        shouldExtractArchiveForProgrammer({
          filePath,
          preferredProgrammerPaths,
        }),
      );
      if (nestedArchiveCandidates.length > 0) {
        const nestedFiles = await extractNestedProgrammerArchives({
          archivePaths: nestedArchiveCandidates,
          workDir: context.workDir,
        });
        if (nestedFiles.length > 0) {
          allExtractedFiles = [...new Set([...allExtractedFiles, ...nestedFiles])];
        }
      }
      if (!programmerPath && loadInfoText) {
        programmerPath = resolveFirehoseProgrammerFromLoadInfo({
          loadInfoText,
          extractedFiles: allExtractedFiles,
        });
      }
      if (!programmerPath) {
        programmerPath = findFirehoseProgrammer({
          extractedFiles: allExtractedFiles,
          preferredProgrammerPaths,
          preferredStorage: programmerStorageHint,
        });
      }
    }
    if (!programmerPath) {
      return {
        plannerId: 'edl-firehose',
        plannerPriority: 120,
        commandSource: `edl:${basename(rawprogramPath)}`,
        sourceFileName: basename(rawprogramPath),
        commands: [],
        warnings: [
          'EDL firmware detected (rawprogram XML), but no firehose programmer (.mbn/.elf/.bin) was found.',
        ],
      };
    }

    const rawprogramRelative = relative(context.workDir, rawprogramPath);
    const patchRelative = patchPath ? relative(context.workDir, patchPath) : undefined;
    const programmerRelative = relative(context.workDir, programmerPath);
    const storage = resolveAutoQdlStorage({
      requestedStorage,
      programmerPath,
      rawprogramPath,
      loadInfoText,
      rawprogramText,
    });

    const labelParts = ['qdl', '--storage', storage];
    if (serial) {
      labelParts.push('--serial', serial);
    }
    labelParts.push(programmerRelative, rawprogramRelative);
    if (patchRelative) {
      labelParts.push(patchRelative);
    }

    return {
      plannerId: 'edl-firehose',
      plannerPriority: 120,
      commandSource: `edl:${basename(rawprogramPath)}`,
      sourceFileName: basename(rawprogramPath),
      commands: [
        {
          tool: 'edl-firehose',
          label: labelParts.join(' '),
          softFail: false,
          timeoutMs: defaultQdlCommandTimeoutMs,
          storage,
          serial,
          programmerPath: programmerRelative,
          rawprogramPath: rawprogramRelative,
          patchPath: patchRelative,
        },
      ],
      warnings: [],
    };
  },
};
