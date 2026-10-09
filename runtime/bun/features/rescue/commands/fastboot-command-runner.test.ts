import { describe, expect, test } from 'bun:test';
import { stripFlashOptions } from './fastboot-command-runner.ts';

describe('stripFlashOptions', () => {
  test('keeps plain partition and file', () => {
    expect(stripFlashOptions(['boot_a', 'boot.img'])).toEqual(['boot_a', 'boot.img']);
  });

  test('drops -S sparse size so the size is not treated as the file', () => {
    expect(stripFlashOptions(['-S', '1G', 'super', 'super.img'])).toEqual(['super', 'super.img']);
  });

  test('drops other flags and their values', () => {
    expect(stripFlashOptions(['--slot', 'a', 'super', 'super.img'])).toEqual([
      'super',
      'super.img',
    ]);
    expect(stripFlashOptions(['--skip-reboot', 'tee_a', 'tee.img'])).toEqual(['tee_a', 'tee.img']);
  });
});
