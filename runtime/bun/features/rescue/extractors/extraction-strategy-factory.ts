import { isTarFamilyArchiveExtension } from './archive-format.ts';
import {
  sevenZipExtractionStrategy,
  tarExtractionStrategy,
  unzipExtractionStrategy,
} from './extraction-strategies.ts';
import type { ExtractionContext, ExtractionStrategy } from './extraction-strategy.ts';

export function createExtractionStrategyOrder(context: ExtractionContext): ExtractionStrategy[] {
  if (isTarFamilyArchiveExtension(context.extension)) {
    return [tarExtractionStrategy, sevenZipExtractionStrategy].filter((strategy) =>
      strategy.supports(context),
    );
  }

  if (context.extension === '.zip' && context.platform !== 'win32') {
    return [unzipExtractionStrategy, sevenZipExtractionStrategy].filter((strategy) =>
      strategy.supports(context),
    );
  }

  if (context.extension === '.zip' && context.platform === 'win32') {
    return [sevenZipExtractionStrategy, tarExtractionStrategy].filter((strategy) =>
      strategy.supports(context),
    );
  }

  return [sevenZipExtractionStrategy].filter((strategy) => strategy.supports(context));
}
