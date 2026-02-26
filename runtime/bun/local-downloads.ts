import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { requestApi } from '../../core/infra/lmsa/api.ts';
import type { AttachLocalRecipeResponse, LocalDownloadedFilesResponse } from '../shared/rpc.ts';
import { readFirmwareMetadata, writeFirmwareMetadata } from './firmware-metadata.ts';
import {
  asRecord,
  firstStringField,
  getDownloadDirectory,
  getRescueDirectory,
  getRescueExtractDirectoryRoot,
  hasUsableExtractedRescueScripts,
  isRescueRecipeContent,
  isSupportedFirmwareArchive,
  normalizeRemoteUrl,
  sanitizeDirectoryName,
  stripFirmwareArchiveExtension,
} from './firmware-package-utils.ts';

async function fetchRecipeContent(recipeUrl: string) {
  const response = await fetch(recipeUrl, {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(`Recipe request failed (${response.status} ${response.statusText}).`);
  }
  const text = await response.text();
  return JSON.parse(text) as unknown;
}

async function assertRescueRecipeUrl(recipeUrl: string) {
  const recipeContent = await fetchRecipeContent(recipeUrl);
  if (!isRescueRecipeContent(recipeContent)) {
    throw new Error(
      'Recipe is not a rescue/flash recipe (expected LMSA_Rescue with FastbootFlash step).',
    );
  }
}

function extractRecipeUrlFromModelRecipeResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const content =
    root.content && typeof root.content === 'object'
      ? (root.content as Record<string, unknown>)
      : null;
  const candidateValues = [content?.flashFlow, content?.recipe];
  const first = candidateValues.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return first ? normalizeRemoteUrl(first) : '';
}

function isFirmwareArchive(name: string) {
  return isSupportedFirmwareArchive(name);
}

async function findLegacyExtractDirForArchive(archiveFileName: string) {
  const rescueDir = getRescueDirectory();
  if (!existsSync(rescueDir)) {
    return '';
  }

  const normalizedArchiveBase =
    stripFirmwareArchiveExtension(basename(archiveFileName)) || basename(archiveFileName);
  const legacyInfoCandidates = [
    `${normalizedArchiveBase}.info.txt`.toLowerCase(),
    `${normalizedArchiveBase.replace(/\.xml$/i, '')}.info.txt`.toLowerCase(),
  ];

  const entries = await readdir(rescueDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'extracted') continue;
    const candidateDir = join(rescueDir, entry.name);
    const inner = await readdir(candidateDir, { withFileTypes: true });
    const innerFiles = inner.filter((item) => item.isFile()).map((item) => item.name.toLowerCase());

    const hasInfoLink = legacyInfoCandidates.some((name) => innerFiles.includes(name));
    if (hasInfoLink && hasUsableExtractedRescueScripts(candidateDir)) {
      return candidateDir;
    }
  }
  return '';
}

async function resolveLinkedExtractDir(archiveFileName: string) {
  const withoutArchiveExtension = stripFirmwareArchiveExtension(archiveFileName) || archiveFileName;
  const expectedDir = join(
    getRescueExtractDirectoryRoot(),
    sanitizeDirectoryName(withoutArchiveExtension),
  );
  if (hasUsableExtractedRescueScripts(expectedDir)) {
    return { extractedDir: expectedDir, hasExtractedDir: true };
  }
  const legacyExtractDir = await findLegacyExtractDirForArchive(archiveFileName);
  if (legacyExtractDir) {
    return { extractedDir: legacyExtractDir, hasExtractedDir: true };
  }
  return { extractedDir: expectedDir, hasExtractedDir: false };
}

export async function listLocalDownloadedFiles(): Promise<LocalDownloadedFilesResponse> {
  const downloadDirectory = getDownloadDirectory();
  if (!existsSync(downloadDirectory)) {
    return { ok: true, files: [] };
  }

  try {
    const entries = await readdir(downloadDirectory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && isFirmwareArchive(entry.name))
        .map(async (entry) => {
          const fullPath = join(downloadDirectory, entry.name);
          const info = await stat(fullPath);
          const linkedExtract = await resolveLinkedExtractDir(entry.name);
          const metadata = await readFirmwareMetadata(fullPath);
          const userHome = homedir();
          const relativePath = fullPath.startsWith(userHome)
            ? relative(userHome, fullPath)
            : fullPath;

          const relativeExtractedDir = linkedExtract.extractedDir.startsWith(userHome)
            ? relative(userHome, linkedExtract.extractedDir)
            : linkedExtract.extractedDir;

          return {
            fileName: entry.name,
            fullPath,
            relativePath,
            sizeBytes: info.size,
            modifiedAt: info.mtimeMs,
            publishDate: metadata?.publishDate,
            extractedDir: linkedExtract.extractedDir,
            relativeExtractedDir,
            hasExtractedDir: linkedExtract.hasExtractedDir,
            recipeUrl: metadata?.recipeUrl,
            romMatchIdentifier: metadata?.romMatchIdentifier,
            selectedParameters: metadata?.selectedParameters,
            metadataSource: metadata?.source,
            hasRecipeMetadata: Boolean(metadata?.recipeUrl),
          };
        }),
    );

    files.sort((left, right) => right.modifiedAt - left.modifiedAt);
    return {
      ok: true,
      files,
    };
  } catch (error) {
    return {
      ok: false,
      files: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function attachLocalRecipeFromModel(payload: {
  filePath: string;
  fileName: string;
  modelName: string;
  marketName?: string;
  category?: string;
}): Promise<AttachLocalRecipeResponse> {
  const { filePath, fileName, modelName, marketName, category } = payload;
  if (!filePath || !fileName) {
    return {
      ok: false,
      filePath,
      error: 'Missing local firmware file path.',
    };
  }
  if (!(await Bun.file(filePath).exists())) {
    return {
      ok: false,
      filePath,
      error: 'Local firmware file was not found.',
    };
  }
  if (!modelName.trim()) {
    return {
      ok: false,
      filePath,
      error: 'Model name is required to fetch recipe metadata.',
    };
  }

  try {
    const response = await requestApi('/rescueDevice/getRescueModelRecipe.jhtml', {
      modelName: modelName.trim(),
      marketName: (marketName || '').trim(),
      category: (category || '').trim(),
    });
    const raw = (await response.json()) as {
      code?: string;
      desc?: string;
      content?: unknown;
    };
    const code = typeof raw?.code === 'string' ? raw.code : '';
    const description = typeof raw?.desc === 'string' ? raw.desc : '';
    if (code !== '0000') {
      return {
        ok: false,
        filePath,
        code,
        description,
        error: description || `Recipe lookup failed (${code || 'unknown'}).`,
      };
    }

    const content = asRecord(raw?.content);
    const recipeUrl = extractRecipeUrlFromModelRecipeResponse(raw);
    if (!recipeUrl) {
      const readFlowOnly = firstStringField(content, ['readFlow']);
      return {
        ok: false,
        filePath,
        code,
        description,
        error: readFlowOnly
          ? 'Rescue Lite requires flashFlow. Model recipe returned readFlow-only data.'
          : 'Recipe response did not include a usable flash recipe URL.',
      };
    }
    await assertRescueRecipeUrl(recipeUrl);

    await writeFirmwareMetadata(filePath, {
      source: 'manual-model',
      romName: fileName,
      recipeUrl,
      selectedParameters: {
        modelName: modelName.trim(),
        ...(marketName?.trim() ? { marketName: marketName.trim() } : {}),
        ...(category?.trim() ? { category: category.trim() } : {}),
      },
    });

    return {
      ok: true,
      filePath,
      recipeUrl,
      code,
      description,
    };
  } catch (error) {
    return {
      ok: false,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function attachLocalRecipeMetadata(payload: {
  filePath: string;
  fileName: string;
  recipeUrl: string;
  romName?: string;
  romUrl?: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
  source?: string;
}): Promise<AttachLocalRecipeResponse> {
  const {
    filePath,
    fileName,
    recipeUrl,
    romName,
    romUrl,
    publishDate,
    romMatchIdentifier,
    selectedParameters,
    source,
  } = payload;
  if (!filePath || !fileName) {
    return {
      ok: false,
      filePath,
      error: 'Missing local firmware file path.',
    };
  }
  if (!(await Bun.file(filePath).exists())) {
    return {
      ok: false,
      filePath,
      error: 'Local firmware file was not found.',
    };
  }

  const normalizedRecipeUrl = normalizeRemoteUrl(recipeUrl || '');
  if (!normalizedRecipeUrl) {
    return {
      ok: false,
      filePath,
      error: 'Missing recipe URL.',
    };
  }

  try {
    await assertRescueRecipeUrl(normalizedRecipeUrl);
    await writeFirmwareMetadata(filePath, {
      source: source || 'variant-link',
      romName: (romName || fileName).trim(),
      romUrl: (romUrl || '').trim(),
      publishDate: (publishDate || '').trim(),
      romMatchIdentifier: (romMatchIdentifier || '').trim(),
      recipeUrl: normalizedRecipeUrl,
      selectedParameters,
    });
    return {
      ok: true,
      filePath,
      recipeUrl: normalizedRecipeUrl,
    };
  } catch (error) {
    return {
      ok: false,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
export async function deleteLocalFile(payload: {
  filePath: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const file = Bun.file(payload.filePath);
    if (await file.exists()) {
      await file.delete();
    }

    const metadataPath = `${payload.filePath}.lmfd.json`;
    const metadataFile = Bun.file(metadataPath);
    if (await metadataFile.exists()) {
      await metadataFile.delete();
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
