import { describe, expect, test } from 'bun:test';
import {
  formatFastbootArgs,
  isWipeSensitivePartition,
  parseCommandTokens,
  shouldSkipForDataReset,
} from './rescue-command-tokens.ts';

// Args are fastboot arguments (without the leading "fastboot" binary name).
describe('shouldSkipForDataReset', () => {
  test('skips wipe commands when user data must be preserved', () => {
    expect(shouldSkipForDataReset(['erase', 'userdata'], 'no')).toBe(true);
    expect(shouldSkipForDataReset(['erase', 'cache'], 'no')).toBe(true);
    expect(shouldSkipForDataReset(['format', 'metadata'], 'no')).toBe(true);
    expect(shouldSkipForDataReset(['flash', 'userdata', 'file.img'], 'no')).toBe(true);
    expect(shouldSkipForDataReset(['-w'], 'no')).toBe(true);
    expect(shouldSkipForDataReset(['--wipe'], 'no')).toBe(true);
  });

  test('runs wipe commands when data reset is allowed', () => {
    expect(shouldSkipForDataReset(['erase', 'userdata'], 'yes')).toBe(false);
    expect(shouldSkipForDataReset(['-w'], 'yes')).toBe(false);
  });

  test('keeps non-wipe commands in both modes', () => {
    expect(shouldSkipForDataReset(['flash', 'boot', 'boot.img'], 'no')).toBe(false);
    expect(shouldSkipForDataReset(['flash', 'boot', 'boot.img'], 'yes')).toBe(false);
    expect(shouldSkipForDataReset(['reboot'], 'no')).toBe(false);
    expect(shouldSkipForDataReset([], 'no')).toBe(false);
  });
});

describe('isWipeSensitivePartition', () => {
  test('flags partitions that hold user data', () => {
    expect(isWipeSensitivePartition('userdata')).toBe(true);
    expect(isWipeSensitivePartition('cache')).toBe(true);
    expect(isWipeSensitivePartition('metadata')).toBe(true);
    expect(isWipeSensitivePartition('USERDATA')).toBe(true);
  });

  test('does not flag ordinary partitions', () => {
    expect(isWipeSensitivePartition('boot')).toBe(false);
    expect(isWipeSensitivePartition('system')).toBe(false);
  });
});

describe('parseCommandTokens', () => {
  test('splits plain commands', () => {
    expect(parseCommandTokens('fastboot flash boot boot.img')).toEqual([
      'fastboot',
      'flash',
      'boot',
      'boot.img',
    ]);
  });

  test('keeps quoted arguments together', () => {
    expect(parseCommandTokens('fastboot flash "system image" file.img')).toEqual([
      'fastboot',
      'flash',
      'system image',
      'file.img',
    ]);
  });

  test('tolerates extra whitespace and empty input', () => {
    expect(parseCommandTokens('  fastboot   reboot  ')).toEqual(['fastboot', 'reboot']);
    expect(parseCommandTokens('')).toEqual([]);
    expect(parseCommandTokens('   ')).toEqual([]);
  });
});

describe('formatFastbootArgs', () => {
  test('renders a full fastboot command line', () => {
    expect(formatFastbootArgs(['flash', 'boot', 'boot.img'])).toBe('fastboot flash boot boot.img');
  });
});
