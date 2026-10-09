/**
 * Structured application logger.
 *
 * - Always mirrors to the process console (parity with the old console.* calls);
 * - optionally appends to a rotating log file once `configureLogger` is called
 *   by the runtime bootstrap (browser contexts simply keep console-only);
 * - redacts secret-looking values (tokens, cookies, passwords) from everything
 *   it writes.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_HEADER_PATTERN =
  /\b(authorization|proxy-authorization|cookie|set-cookie)\b\s*[:=].*/gi;
const SENSITIVE_KEY_VALUE_PATTERN =
  /\b(token|password|passwd|secret|aas[^\s=]*|session[^\s=]*|api[-_]?key)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s;,]+)/gi;

export function redactSensitiveText(text: string): string {
  return text
    .replace(SENSITIVE_HEADER_PATTERN, (match) => {
      const key = match.split(/[:=]/, 1)[0] ?? 'secret';
      return `${key.trim()}: [REDACTED]`;
    })
    .replace(SENSITIVE_KEY_VALUE_PATTERN, '$1=[REDACTED]');
}

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;

let logFilePath: string | null = null;

export function configureLogger(options: { filePath: string }) {
  logFilePath = options.filePath;
  try {
    mkdirSync(dirname(logFilePath), { recursive: true });
  } catch {
    // Best effort — console output still works.
  }
}

function serialize(args: unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }
      if (value instanceof Error) {
        return value.stack || value.message;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(' ');
}

function rotateIfNeeded() {
  if (!logFilePath) {
    return;
  }
  try {
    const stats = statSync(logFilePath);
    if (stats.size < MAX_LOG_FILE_BYTES) {
      return;
    }
    renameSync(logFilePath, `${logFilePath}.1`);
  } catch {
    // Ignore rotation failures — logging must never break the application.
  }
}

function write(level: LogLevel, scope: string, args: unknown[]) {
  const message = redactSensitiveText(serialize(args));
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} [${scope}] ${message}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  if (!logFilePath) {
    return;
  }
  try {
    rotateIfNeeded();
    appendFileSync(logFilePath, `${line}\n`);
  } catch {
    // Logging must never break the application.
  }
}

export interface Logger {
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export function getLogger(scope: string): Logger {
  return {
    debug: (...args: unknown[]) => write('debug', scope, args),
    info: (...args: unknown[]) => write('info', scope, args),
    warn: (...args: unknown[]) => write('warn', scope, args),
    error: (...args: unknown[]) => write('error', scope, args),
  };
}
