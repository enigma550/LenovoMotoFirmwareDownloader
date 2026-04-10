/**
 * EDL Firehose programmer resolution.
 * Finds and ranks firehose programmer binaries (.mbn/.elf/.bin) from extracted firmware.
 */
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  collectFilesRecursive,
  sanitizeDirectoryName,
} from '../../../../firmware-package-utils.ts';
import { getFirmwareArchiveExtension } from '../../extractors/archive-format.ts';
import { extractFirmwareArchive } from '../../extractors/extract-firmware-archive.ts';

export type ResolvedQdlStorage = 'emmc' | 'ufs';

export function parseAttributes(attributeSource: string) {
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

export function normalizeLookupPath(value: string) {
  return value.replace(/\\/g, '/').toLowerCase();
}

export function resolveFirehoseProgrammerFromLoadInfo(options: {
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

export function findProgrammerImagePathsFromLoadInfo(loadInfoText: string) {
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

export function inferProgrammerStorageFromText(text: string): ResolvedQdlStorage | null {
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

  if (lowerName.includes('validated')) {
    score -= 150;
  }

  return score;
}

export function findFirehoseProgrammer(options: {
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
      return basename(left).length - basename(right).length;
    });

  return ranked[0] || '';
}

function preferredPathBasenames(preferredProgrammerPaths: string[]) {
  return new Set(
    preferredProgrammerPaths.map((value) => basename(normalizeLookupPath(value))).filter(Boolean),
  );
}

export function findSaharaProgrammerConfig(options: {
  extractedFiles: string[];
  preferredProgrammerPaths?: string[];
}) {
  const preferredFileNames = preferredPathBasenames(options.preferredProgrammerPaths || []);
  const ranked = options.extractedFiles
    .filter((filePath) => {
      const lowerName = basename(filePath).toLowerCase();
      return lowerName.endsWith('.xml') && lowerName.includes('sahara');
    })
    .sort((left, right) => {
      const leftName = basename(left).toLowerCase();
      const rightName = basename(right).toLowerCase();
      const leftPreferred = preferredFileNames.has(leftName) ? 1 : 0;
      const rightPreferred = preferredFileNames.has(rightName) ? 1 : 0;
      if (leftPreferred !== rightPreferred) {
        return rightPreferred - leftPreferred;
      }
      return leftName.length - rightName.length;
    });

  return ranked[0] || '';
}

export function findProgrammerArchive(options: {
  extractedFiles: string[];
  preferredProgrammerPaths?: string[];
}) {
  const preferredFileNames = preferredPathBasenames(options.preferredProgrammerPaths || []);
  const ranked = options.extractedFiles
    .filter((filePath) => {
      const lowerName = basename(filePath).toLowerCase();
      return (
        lowerName.endsWith('.cpio') ||
        lowerName.endsWith('.cpio.gz') ||
        (lowerName.includes('programmer') && lowerName.endsWith('.img'))
      );
    })
    .sort((left, right) => {
      const leftName = basename(left).toLowerCase();
      const rightName = basename(right).toLowerCase();
      const leftPreferred = preferredFileNames.has(leftName) ? 1 : 0;
      const rightPreferred = preferredFileNames.has(rightName) ? 1 : 0;
      if (leftPreferred !== rightPreferred) {
        return rightPreferred - leftPreferred;
      }
      const leftProgrammerNamed = leftName.includes('programmer') ? 1 : 0;
      const rightProgrammerNamed = rightName.includes('programmer') ? 1 : 0;
      if (leftProgrammerNamed !== rightProgrammerNamed) {
        return rightProgrammerNamed - leftProgrammerNamed;
      }
      return leftName.length - rightName.length;
    });

  return ranked[0] || '';
}

export function shouldExtractArchiveForProgrammer(options: {
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

export async function extractNestedProgrammerArchives(options: {
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
