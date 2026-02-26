import { isTarFamilyArchiveExtension } from './archive-format.ts';
import type { ExtractionStrategy } from './extraction-strategy.ts';

export const tarExtractionStrategy: ExtractionStrategy = {
  name: 'tar',
  supports: (context) =>
    isTarFamilyArchiveExtension(context.extension) ||
    (context.platform === 'win32' && context.extension === '.zip'),
  buildCommand: (context) => ['tar', '-xvf', context.packagePath, '-C', context.extractDir],
};

export const unzipExtractionStrategy: ExtractionStrategy = {
  name: 'unzip',
  allowWarningExitCodes: [1],
  supports: (context) => context.platform !== 'win32' && context.extension === '.zip',
  buildCommand: (context) => ['unzip', '-o', context.packagePath, '-d', context.extractDir],
};

export const sevenZipExtractionStrategy: ExtractionStrategy = {
  name: '7z',
  supports: () => true,
  buildCommand: (context) => [
    '7z',
    'x',
    '-y',
    '-bb1',
    context.packagePath,
    `-o${context.extractDir}`,
  ],
};
