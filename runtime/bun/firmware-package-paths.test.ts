import { describe, expect, test } from 'bun:test';
import {
  getExtractDirForPackagePath,
  sanitizeDirectoryName,
  sanitizeFileName,
} from './firmware-package-paths.ts';

describe('sanitizeFileName', () => {
  test('keeps ordinary firmware names', () => {
    expect(sanitizeFileName('XT2335-3_14.0_retus.zip')).toBe('XT2335-3_14.0_retus.zip');
  });

  test('neutralizes dot-segment escapes from hostile names', () => {
    expect(sanitizeFileName('..')).toBe('firmware.zip');
    expect(sanitizeFileName('.')).toBe('firmware.zip');
    expect(sanitizeFileName('...')).toBe('firmware.zip');
  });

  test('strips separators and control characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?.zip')).toBe('a_b_c_d_e_.zip');
  });

  test('prefixes Windows reserved device names', () => {
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('nul.txt')).toBe('_nul.txt');
  });
});

describe('sanitizeDirectoryName', () => {
  test('strips trailing dots and falls back safely', () => {
    expect(sanitizeDirectoryName('firmware...')).toBe('firmware');
    expect(sanitizeDirectoryName('..')).toBe('firmware');
  });
});

describe('getExtractDirForPackagePath', () => {
  test('derives a sanitized extraction directory under the rescue root', () => {
    const dir = getExtractDirForPackagePath(
      '/home/user/Downloads/LenovoMotoFirmwareDownloader/firmware.zip',
    );
    expect(dir.endsWith('/.rescue-lite/extracted/firmware')).toBe(true);
  });
});
