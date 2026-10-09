import { describe, expect, test } from 'bun:test';
import { getRescueExtractDirectoryRoot } from '../../firmware-package-utils.ts';
import {
  buildRescueLiteResult,
  buildRescueMetadataPatch,
  resolveLinkedExtractDir,
} from './rescue-package-stage.ts';

describe('buildRescueMetadataPatch', () => {
  test('prefers the explicit romMatchIdentifier, then parameter fallbacks', () => {
    expect(
      buildRescueMetadataPatch({
        romName: 'XT2335 firmware',
        publishDate: '2026-01-01',
        romMatchIdentifier: 'explicit',
        selectedParameters: { romMatchIdentifier: 'from-params', romMatchId: 'from-legacy' },
      }).romMatchIdentifier,
    ).toBe('explicit');

    expect(
      buildRescueMetadataPatch({
        romName: 'XT2335 firmware',
        selectedParameters: { romMatchIdentifier: 'from-params', romMatchId: 'from-legacy' },
      }).romMatchIdentifier,
    ).toBe('from-params');

    expect(
      buildRescueMetadataPatch({
        romName: 'XT2335 firmware',
        selectedParameters: { romMatchId: 'from-legacy' },
      }).romMatchIdentifier,
    ).toBe('from-legacy');

    expect(buildRescueMetadataPatch({ romName: 'x' }).romMatchIdentifier).toBeUndefined();
  });

  test('marks the source and forwards package fields', () => {
    const patch = buildRescueMetadataPatch({
      romUrl: 'https://example/firmware.zip',
      romName: 'firmware',
      publishDate: '2026-02-02',
      recipeUrl: 'https://example/recipe',
      selectedParameters: { market: 'retus' },
    });
    expect(patch.source).toBe('rescue-lite');
    expect(patch.romUrl).toBe('https://example/firmware.zip');
    expect(patch.romName).toBe('firmware');
    expect(patch.publishDate).toBe('2026-02-02');
    expect(patch.recipeUrl).toBe('https://example/recipe');
    expect(patch.selectedParameters).toEqual({ market: 'retus' });
  });
});

describe('resolveLinkedExtractDir', () => {
  test('uses the sanitized derived directory when none is provided', () => {
    expect(
      resolveLinkedExtractDir('/home/user/Downloads/LenovoMotoFirmwareDownloader/fw.zip', ''),
    ).toMatch(/\/\.rescue-lite\/extracted\/fw$/);
  });

  test('keeps a provided extracted directory when set', () => {
    const customDir = `${getRescueExtractDirectoryRoot()}/custom`;
    expect(resolveLinkedExtractDir('/tmp/fw.zip', customDir)).toBe(customDir);
  });

  test('refuses an extracted directory outside the rescue extract root', () => {
    expect(() => resolveLinkedExtractDir('/tmp/fw.zip', '/etc')).toThrow();
  });
});

describe('buildRescueLiteResult', () => {
  test('builds the shared success payload shape', () => {
    const result = buildRescueLiteResult({
      downloadId: 'dl-1',
      savePath: '/home/user/Downloads/LenovoMotoFirmwareDownloader/fw.zip',
      workDir: '/tmp/work',
      bytesDownloaded: 10,
      totalBytes: 0,
      dryRun: true,
      reusedPackage: true,
      reusedExtraction: false,
      commandSource: 'flashfile.xml',
      commandPlan: ['fastboot flash boot boot.img'],
      flashTransport: 'fastboot',
      qdlStorage: 'auto',
      qdlSerial: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.fileName).toBe('fw.zip');
    expect(result.dryRun).toBe(true);
    expect(result.totalBytes).toBe(10); // falls back to downloaded bytes
    expect(result.commandSource).toBe('flashfile.xml');
    expect(result.commandPlan).toEqual(['fastboot flash boot boot.img']);
  });
});
