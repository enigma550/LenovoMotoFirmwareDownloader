import { describe, expect, test } from 'bun:test';
import { redactSensitiveText } from './update-logger.ts';

describe('redactSensitiveText', () => {
  test('redacts authorization headers and tokens', () => {
    const line = 'POST /oauth response authorization: Bearer eyJhbGciOi...secret';
    expect(redactSensitiveText(line)).not.toContain('eyJhbGciOi');
    expect(redactSensitiveText(line)).toContain('[REDACTED]');
  });

  test('redacts cookies and aas tokens', () => {
    const line = 'cookie: JSESSIONID=abc123; aasToken=ya29.super-secret';
    const redacted = redactSensitiveText(line);
    expect(redacted).not.toContain('abc123');
    expect(redacted).not.toContain('ya29.super-secret');
  });

  test('keeps ordinary log lines intact', () => {
    const line = 'git merge --ff-only origin/main | exit=0';
    expect(redactSensitiveText(line)).toBe(line);
  });
});
