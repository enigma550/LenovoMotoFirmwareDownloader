import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPathInsideAllowedRoots,
  assertSafeExternalUrl,
  assertSafeSnapshotId,
  hardenSanitizedFileName,
  isPathInsideAllowedRoots,
  UnsafePathError,
} from './path-guard.ts';

function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'lmfd-path-guard-'));
  const downloads = join(root, 'Downloads', 'LenovoMotoFirmwareDownloader');
  mkdirSync(join(downloads, 'app-store'), { recursive: true });
  mkdirSync(join(root, 'secrets'), { recursive: true });
  writeFileSync(join(root, 'secrets', 'id_rsa'), 'private key');
  writeFileSync(join(downloads, 'firmware.zip'), 'firmware');
  return { root, downloads, outside: join(root, 'secrets', 'id_rsa') };
}

describe('assertPathInsideAllowedRoots', () => {
  test('accepts files inside the download root and its subdirectories', () => {
    const { downloads } = createSandbox();
    expect(() =>
      assertPathInsideAllowedRoots(join(downloads, 'firmware.zip'), [downloads]),
    ).not.toThrow();
    expect(() =>
      assertPathInsideAllowedRoots(join(downloads, 'app-store', 'signal.apk'), [downloads]),
    ).not.toThrow();
  });

  test('rejects files outside the allowed roots', () => {
    const { downloads, outside } = createSandbox();
    expect(() => assertPathInsideAllowedRoots(outside, [downloads])).toThrow(UnsafePathError);
  });

  test('rejects dot-segment escapes even when normalized away by join', () => {
    const { downloads } = createSandbox();
    expect(() =>
      assertPathInsideAllowedRoots(join(downloads, '..', '..', 'secrets', 'id_rsa'), [downloads]),
    ).toThrow(UnsafePathError);
    expect(() =>
      assertPathInsideAllowedRoots(`${downloads}/../../etc/passwd`, [downloads]),
    ).toThrow(UnsafePathError);
  });

  test('rejects relative paths, empty paths and null bytes', () => {
    const { downloads } = createSandbox();
    expect(() => assertPathInsideAllowedRoots('firmware.zip', [downloads])).toThrow(
      UnsafePathError,
    );
    expect(() => assertPathInsideAllowedRoots('', [downloads])).toThrow(UnsafePathError);
    expect(() => assertPathInsideAllowedRoots(`${downloads}/firm\0ware.zip`, [downloads])).toThrow(
      UnsafePathError,
    );
  });

  test('rejects sibling directories sharing a name prefix with the root', () => {
    const { root, downloads } = createSandbox();
    const sibling = `${downloads}-evil`;
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'x.zip'), 'x');
    expect(isPathInsideAllowedRoots(join(sibling, 'x.zip'), [downloads])).toBe(false);
    expect(isPathInsideAllowedRoots(join(root, 'Downloads'), [downloads])).toBe(false);
  });

  test('rejects paths escaping via symlinks', () => {
    const { root, downloads } = createSandbox();
    const escapeLink = join(downloads, 'escape');
    symlinkSync(join(root, 'secrets'), escapeLink);
    expect(isPathInsideAllowedRoots(join(escapeLink, 'id_rsa'), [downloads])).toBe(false);
  });
});

describe('assertSafeSnapshotId', () => {
  test('accepts plain folder names', () => {
    expect(assertSafeSnapshotId('backup-2026-10-09T12:00:00')).toBe('backup-2026-10-09T12:00:00');
  });

  test('rejects traversal attempts and separators', () => {
    expect(() => assertSafeSnapshotId('../../.ssh')).toThrow(UnsafePathError);
    expect(() => assertSafeSnapshotId('..')).toThrow(UnsafePathError);
    expect(() => assertSafeSnapshotId('.')).toThrow(UnsafePathError);
    expect(() => assertSafeSnapshotId('a/b')).toThrow(UnsafePathError);
    expect(() => assertSafeSnapshotId('..\\..\\windows')).toThrow(UnsafePathError);
    expect(() => assertSafeSnapshotId('')).toThrow(UnsafePathError);
    expect(() => assertSafeSnapshotId('bad\0id')).toThrow(UnsafePathError);
  });
});

describe('assertSafeExternalUrl', () => {
  test('accepts http and https URLs', () => {
    expect(assertSafeExternalUrl('https://support.lenovo.com/x')).toBe(
      'https://support.lenovo.com/x',
    );
    expect(() => assertSafeExternalUrl('http://localhost:8080/cb')).not.toThrow();
  });

  test('rejects non-web protocols handed to the OS opener', () => {
    expect(() => assertSafeExternalUrl('file:///C:/payload.exe')).toThrow(UnsafePathError);
    expect(() => assertSafeExternalUrl('ms-msdt:/id PCWDiagnostic')).toThrow(UnsafePathError);
    expect(() => assertSafeExternalUrl('javascript:alert(1)')).toThrow(UnsafePathError);
    expect(() => assertSafeExternalUrl('not a url')).toThrow(UnsafePathError);
  });
});

describe('hardenSanitizedFileName', () => {
  test('neutralizes pure dot-segment names', () => {
    expect(hardenSanitizedFileName('..', 'firmware.zip')).toBe('firmware.zip');
    expect(hardenSanitizedFileName('.', 'firmware.zip')).toBe('firmware.zip');
    expect(hardenSanitizedFileName('...', 'firmware.zip')).toBe('firmware.zip');
    expect(hardenSanitizedFileName('', 'firmware.zip')).toBe('firmware.zip');
  });

  test('strips trailing dots and spaces (Windows-hostile names)', () => {
    expect(hardenSanitizedFileName('firmware.zip. ', 'x')).toBe('firmware.zip');
  });

  test('prefixes Windows reserved device names', () => {
    expect(hardenSanitizedFileName('CON', 'x')).toBe('_CON');
    expect(hardenSanitizedFileName('con.txt', 'x')).toBe('_con.txt');
    expect(hardenSanitizedFileName('COM1.zip', 'x')).toBe('_COM1.zip');
  });

  test('keeps normal names untouched', () => {
    expect(hardenSanitizedFileName('XT2335-3_14.0.zip', 'x')).toBe('XT2335-3_14.0.zip');
    expect(hardenSanitizedFileName('.rescue-lite', 'x')).toBe('.rescue-lite');
  });
});
