/**
 * EDL Firehose command planner strategy.
 *
 * Split into focused submodules:
 *   - edl-programmer-resolver.ts — Programmer binary resolution and ranking
 *   - edl-rawprogram-picker.ts   — Rawprogram/patch XML picking + storage detection
 *
 * This file keeps the `plan()` strategy method that composes both modules.
 */
import { basename, dirname, relative } from 'node:path';
import { parseCommandTokens } from '../../../../firmware-package-utils.ts';
import { defaultQdlCommandTimeoutMs } from '../../commands/rescue-command-policy.ts';
import type { RescueCommandPlannerStrategy } from '../command-planner-strategy.ts';
import {
  extractNestedProgrammerArchives,
  findFirehoseProgrammer,
  findProgrammerArchive,
  findProgrammerImagePathsFromLoadInfo,
  findSaharaProgrammerConfig,
  parseAttributes,
  resolveFirehoseProgrammerFromLoadInfo,
  shouldExtractArchiveForProgrammer,
} from './edl-programmer-resolver.ts';
import {
  analyzePatchDataResetSafety,
  pickBestRawprogram,
  pickPatchXml,
  resolveAutoQdlStorage,
  resolveProgrammerSelectionStorageHint,
} from './edl-rawprogram-picker.ts';

function collectReferencedImageNames(xmlText: string) {
  const names = new Set<string>();
  const nodeRegex = /<(program|patch|read|erase|zeroout)\b([^>]*?)\/?>/gi;
  let match = nodeRegex.exec(xmlText);
  while (match !== null) {
    const attrs = parseAttributes(match[2] || '');
    for (const key of ['filename', 'file', 'file_name', 'image_path', 'imagepath'] as const) {
      const value = (attrs[key] || '').trim();
      if (!value) {
        continue;
      }
      names.add(basename(value.replace(/\\/g, '/')));
    }
    match = nodeRegex.exec(xmlText);
  }
  return names;
}

function collectQdlIncludePaths(options: {
  workDir: string;
  extractedFiles: string[];
  programmerPath: string;
  rawprogramPath: string;
  patchPath?: string;
  rawprogramText?: string;
}) {
  const includeDirs = new Set<string>();
  const addFileDir = (filePath?: string) => {
    if (!filePath) {
      return;
    }
    const relDir = relative(options.workDir, dirname(filePath)) || '.';
    if (relDir !== '.' && relDir !== '') {
      includeDirs.add(relDir);
    }
  };

  addFileDir(options.programmerPath);
  addFileDir(options.rawprogramPath);
  addFileDir(options.patchPath);

  const referencedImageNames = collectReferencedImageNames(options.rawprogramText || '');
  if (referencedImageNames.size > 0) {
    for (const candidatePath of options.extractedFiles) {
      if (!referencedImageNames.has(basename(candidatePath))) {
        continue;
      }
      addFileDir(candidatePath);
    }
  }

  return [...includeDirs];
}

type EdlWrapperHints = {
  preferredFileNames: Set<string>;
  includePaths: Set<string>;
};

function collectEdlWrapperHintsFromCommand(rawCommand: string) {
  const hints: EdlWrapperHints = {
    preferredFileNames: new Set<string>(),
    includePaths: new Set<string>(),
  };
  const tokens = parseCommandTokens(rawCommand);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    const optionMatch =
      /^[-/](programmer|rawprogram|patch|searchpath|e|r|p|f)=(.+)$/i.exec(trimmed) || null;
    if (!optionMatch) {
      const normalized = basename(trimmed.replace(/\\/g, '/'));
      if (/\.(?:mbn|elf|bin|xml|cpio|cmd|bat|sh)$/i.test(normalized)) {
        hints.preferredFileNames.add(normalized.toLowerCase());
      }
      continue;
    }

    const [, optionNameRaw, optionValueRaw] = optionMatch;
    const optionName = optionNameRaw?.toLowerCase() || '';
    const optionValue = (optionValueRaw || '').split(';').pop()?.trim() || '';
    const cleaned = optionValue
      .replace(/\{[^}]+\}/g, '')
      .replace(/%[^%]+%/g, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    const normalized = cleaned.replace(/\\/g, '/');
    const base = basename(normalized);

    if (base && /\.(?:mbn|elf|bin|xml|cpio|cmd|bat|sh)$/i.test(base)) {
      hints.preferredFileNames.add(base.toLowerCase());
    }

    if (optionName === 'searchpath' && normalized) {
      const relDir = normalized.replace(/^\/+|\/+$/g, '').trim();
      if (relDir && relDir !== '.' && !relDir.includes('{')) {
        hints.includePaths.add(relDir);
      }
    }
  }

  return hints;
}

async function collectEdlWrapperHintsFromStartupScripts(options: {
  extractedFiles: string[];
  preferredFileNames?: Set<string>;
}) {
  const hints: EdlWrapperHints = {
    preferredFileNames: new Set<string>(),
    includePaths: new Set<string>(),
  };
  const scriptCandidates = options.extractedFiles
    .filter((filePath) => /\.(?:cmd|bat|sh)$/i.test(basename(filePath)))
    .filter((filePath) => {
      const lower = basename(filePath).toLowerCase();
      return (
        options.preferredFileNames?.has(lower) ||
        lower === 'rescue.cmd' ||
        lower === 'flash.cmd' ||
        lower === 'rescue.bat' ||
        lower === 'flash.bat'
      );
    });

  for (const scriptPath of scriptCandidates) {
    try {
      const scriptText = await Bun.file(scriptPath).text();
      for (const rawLine of scriptText.split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        if (
          !trimmed ||
          /^@?echo\b/i.test(trimmed) ||
          /^rem\b/i.test(trimmed) ||
          /^::/.test(trimmed)
        ) {
          continue;
        }
        const lineHints = collectEdlWrapperHintsFromCommand(trimmed);
        for (const fileName of lineHints.preferredFileNames) {
          hints.preferredFileNames.add(fileName);
        }
        for (const includePath of lineHints.includePaths) {
          hints.includePaths.add(includePath);
        }
      }
    } catch {
      // Ignore unreadable wrapper scripts.
    }
  }

  return hints;
}

export const edlFirehosePlannerStrategy: RescueCommandPlannerStrategy = {
  id: 'edl-firehose',
  priority: 120,
  async plan(context) {
    const requestedStorage = context.qdlStorage;
    const serial = context.qdlSerial?.trim() || undefined;
    const wrapperHints = await collectEdlWrapperHintsFromStartupScripts({
      extractedFiles: context.extractedFiles,
      preferredFileNames: context.recipeHints?.preferredFileNames,
    });
    const preferredFileNames = new Set<string>(context.recipeHints?.preferredFileNames || []);
    for (const fileName of wrapperHints.preferredFileNames) {
      preferredFileNames.add(fileName);
    }
    const rawprogramPick = await pickBestRawprogram({
      extractedFiles: context.extractedFiles,
      dataReset: context.dataReset,
      preferredFileNames,
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
      preferredFileNames,
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
    preferredProgrammerPaths = [
      ...preferredProgrammerPaths,
      ...[...preferredFileNames].filter((fileName) =>
        /\.(?:mbn|elf|bin|xml|cpio)$/i.test(fileName),
      ),
    ];
    const programmerStorageHint = resolveProgrammerSelectionStorageHint({
      requestedStorage,
      rawprogramPath,
      loadInfoText,
      rawprogramText,
    });
    if (!programmerPath) {
      programmerPath = findSaharaProgrammerConfig({
        extractedFiles: allExtractedFiles,
        preferredProgrammerPaths,
      });
    }
    if (!programmerPath) {
      programmerPath = findProgrammerArchive({
        extractedFiles: allExtractedFiles,
        preferredProgrammerPaths,
      });
    }
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
        programmerPath = findSaharaProgrammerConfig({
          extractedFiles: allExtractedFiles,
          preferredProgrammerPaths,
        });
      }
      if (!programmerPath) {
        programmerPath = findProgrammerArchive({
          extractedFiles: allExtractedFiles,
          preferredProgrammerPaths,
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
    const includePaths = collectQdlIncludePaths({
      workDir: context.workDir,
      extractedFiles: allExtractedFiles,
      programmerPath,
      rawprogramPath,
      patchPath,
      rawprogramText,
    });
    for (const includePath of wrapperHints.includePaths) {
      includePaths.push(includePath);
    }
    const uniqueIncludePaths = [...new Set(includePaths.filter(Boolean))];

    const labelParts = ['qdl', '--storage', storage];
    if (serial) {
      labelParts.push('--serial', serial);
    }
    for (const includePath of uniqueIncludePaths) {
      labelParts.push('--include', includePath);
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
          includePaths: uniqueIncludePaths,
          validateWithDryRun: true,
        },
      ],
      warnings: [],
    };
  },
};
