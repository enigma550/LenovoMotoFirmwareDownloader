import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AUTH_CALLBACK_PREFIX = /^softwarefix:\/\/callback/i;
const CALLBACK_DROP_PATH = join(tmpdir(), 'lenovo-moto-firmware-downloader-auth-callback.txt');

function isLenovoTipsSuccessUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname === 'lsa.lenovo.com' &&
      parsed.pathname.toLowerCase() === '/tips/lenovoidsuccess.html' &&
      parsed.searchParams.has('code') &&
      parsed.searchParams.has('state')
    );
  } catch {
    return false;
  }
}

function normalizeCandidate(value: string) {
  const trimmed = value
    .trim()
    .replaceAll(/^['"`]+|['"`]+$/g, '')
    .replaceAll(/[\])>,.;]+$/g, '');
  if (!trimmed) return '';
  if (AUTH_CALLBACK_PREFIX.test(trimmed)) {
    return trimmed;
  }
  if (isLenovoTipsSuccessUrl(trimmed)) {
    return trimmed.replaceAll(/\s+/g, '');
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    if (AUTH_CALLBACK_PREFIX.test(decoded)) {
      return decoded;
    }
    if (isLenovoTipsSuccessUrl(decoded)) {
      return decoded.replaceAll(/\s+/g, '');
    }
  } catch {
    // Ignore malformed URI input.
  }

  return '';
}

function findEmbeddedAuthCallback(value: string) {
  const softwareFixMatch = value.match(/softwarefix:\/\/callback[^\s'"`]+/i);
  if (softwareFixMatch?.[0]) {
    return normalizeCandidate(softwareFixMatch[0]);
  }

  const lenovoTipsMatch = value.match(
    /https?:\/\/lsa\.lenovo\.com\/tips\/lenovoidsuccess\.html[^\s'"`]+/i,
  );
  if (lenovoTipsMatch?.[0]) {
    return normalizeCandidate(lenovoTipsMatch[0]);
  }

  return '';
}

function findStartupAuthCallbackArg(argv: string[]) {
  for (const candidate of argv) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) return normalized;

    const embedded = findEmbeddedAuthCallback(candidate);
    if (embedded) return embedded;
  }
  return '';
}

function findWindowsParentProcessAuthCallback() {
  if (process.platform !== 'win32' || !process.ppid) {
    return '';
  }

  const command = [
    `$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = ${process.ppid}"`,
    'if ($processInfo -and $processInfo.CommandLine) { [Console]::Out.Write($processInfo.CommandLine) }',
  ].join('; ');

  try {
    const result = Bun.spawnSync(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        command,
      ],
      {
        stdout: 'pipe',
        stderr: 'ignore',
      },
    );

    if (result.exitCode !== 0) {
      return '';
    }

    const commandLine = result.stdout.toString().trim();
    return findEmbeddedAuthCallback(commandLine);
  } catch {
    return '';
  }
}

const startupAuthCallbackUrl =
  findStartupAuthCallbackArg(process.argv) || findWindowsParentProcessAuthCallback();
let queuedStartupAuthCallbackUrl = startupAuthCallbackUrl;
let queuedRuntimeAuthCallbackUrl = '';
let consumedStartupAuthCallback = false;

if (queuedStartupAuthCallbackUrl) {
  console.log('[AuthCallback] Captured startup callback URL from process arguments.');
  try {
    writeFileSync(CALLBACK_DROP_PATH, queuedStartupAuthCallbackUrl, 'utf8');
  } catch {
    // Ignore callback drop failures and keep in-memory fallback.
  }
}

function consumeDroppedAuthCallbackUrl() {
  if (!existsSync(CALLBACK_DROP_PATH)) return '';

  try {
    const value = normalizeCandidate(readFileSync(CALLBACK_DROP_PATH, 'utf8'));
    unlinkSync(CALLBACK_DROP_PATH);
    if (value) {
      console.log('[AuthCallback] Loaded callback URL from drop file.');
    }
    return value;
  } catch {
    return '';
  }
}

export function consumeStartupAuthCallbackUrl() {
  if (!consumedStartupAuthCallback) {
    consumedStartupAuthCallback = true;
    if (queuedStartupAuthCallbackUrl) {
      const value = queuedStartupAuthCallbackUrl;
      queuedStartupAuthCallbackUrl = '';
      consumeDroppedAuthCallbackUrl();
      return value;
    }
  }

  if (queuedRuntimeAuthCallbackUrl) {
    const value = queuedRuntimeAuthCallbackUrl;
    queuedRuntimeAuthCallbackUrl = '';
    console.log('[AuthCallback] Consuming runtime callback URL from in-process queue.');
    return value;
  }

  return consumeDroppedAuthCallbackUrl();
}

export function peekStartupAuthCallbackUrl() {
  return queuedStartupAuthCallbackUrl;
}

export function queueRuntimeAuthCallbackUrl(value: string) {
  const normalizedValue = normalizeCandidate(value);
  if (!normalizedValue) {
    return false;
  }
  queuedRuntimeAuthCallbackUrl = normalizedValue;
  return true;
}
