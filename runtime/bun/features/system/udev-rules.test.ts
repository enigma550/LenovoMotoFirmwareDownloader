import { describe, expect, test } from 'bun:test';
import { UDEV_RULES_CONTENT } from './udev-rules.ts';

describe('UDEV_RULES_CONTENT', () => {
  const rules = UDEV_RULES_CONTENT.split('\n').filter((line) => line.startsWith('SUBSYSTEM=='));

  test('covers Motorola, Lenovo, MediaTek, Qualcomm, Unisoc and Google vendors', () => {
    for (const vendor of ['22b8', '17ef', '0e8d', '05c6', '1782', '18d1']) {
      expect(rules.some((rule) => rule.includes(`idVendor}=="${vendor}"`))).toBe(true);
    }
  });

  test('every rule keeps ModemManager away and grants uaccess', () => {
    expect(rules.length).toBe(6);
    for (const rule of rules) {
      expect(rule).toContain('ENV{ID_MM_DEVICE_IGNORE}="1"');
      expect(rule).toContain('TAG+="uaccess"');
    }
  });
});
