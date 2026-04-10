import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupRestoreMessageEntry } from '../../../../shared/desktop-rpc';
import { runCommand } from './connected-backups-adb.ts';
import {
  parseContentQueryRows,
  readContentQueryFirstValue,
} from './connected-backups-content-query.ts';
import {
  type RestoreMessageRecord,
  writeMessagesRestoreData,
} from './connected-backups-restore-data.ts';
import { MAX_BACKUP_MESSAGES, MAX_PREVIEW_MESSAGES } from './connected-backups-shared.ts';

const MAX_PREVIEW_LENGTH = 2000;

function truncatePreview(value: string) {
  const normalized = value
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
  return normalized.length > MAX_PREVIEW_LENGTH
    ? `${normalized.slice(0, MAX_PREVIEW_LENGTH)}…`
    : normalized;
}

async function querySmsRows(appendLog?: (line: string) => void) {
  const result = await runCommand(
    'adb',
    [
      'shell',
      "content query --uri content://sms --projection _id:address:body:date:thread_id:type:read:service_center:sub_id --sort 'date DESC'",
    ],
    120_000,
  );
  if (result.stderrText.trim()) {
    appendLog?.(`Messages scan stderr: ${result.stderrText.trim().slice(0, 200)}`);
  }
  return result;
}

function parseSmsType(raw: string | undefined): 'sent' | 'received' | 'unknown' {
  if (!raw) return 'unknown';
  const value = Number.parseInt(raw, 10);
  if (value === 1) return 'received';
  if (value === 2) return 'sent';
  return 'unknown';
}

async function collectDeviceMessages(maxItems: number, appendLog?: (line: string) => void) {
  const result = await querySmsRows(appendLog);
  if (result.exitCode !== 0) {
    appendLog?.('Messages scan: unable to query SMS provider.');
    return {
      entries: [] as BackupRestoreMessageEntry[],
      restoreRecords: [] as RestoreMessageRecord[],
    };
  }

  const messages: BackupRestoreMessageEntry[] = [];
  const restoreRecords: RestoreMessageRecord[] = [];
  for (const row of parseContentQueryRows(result.stdoutText)) {
    if (messages.length >= maxItems || restoreRecords.length >= maxItems) {
      break;
    }

    const body = readContentQueryFirstValue(row, ['body', 'text']);
    if (!body) {
      continue;
    }

    const smsId = readContentQueryFirstValue(row, ['_id']);
    const address = readContentQueryFirstValue(row, ['address', 'from']);
    const threadId = readContentQueryFirstValue(row, ['thread_id']);
    const dateRaw = readContentQueryFirstValue(row, ['date']);
    const typeRaw = readContentQueryFirstValue(row, ['type']);
    const readRaw = readContentQueryFirstValue(row, ['read']);
    const serviceCenter = readContentQueryFirstValue(row, ['service_center']);
    const subId = readContentQueryFirstValue(row, ['sub_id']);
    const timestamp = dateRaw ? Number(dateRaw) : undefined;
    const messageType = parseSmsType(typeRaw);
    const rawType = typeRaw ? Number.parseInt(typeRaw, 10) : 1;
    const rawRead = readRaw ? Number.parseInt(readRaw, 10) : undefined;
    const normalizedDate = timestamp && Number.isFinite(timestamp) ? timestamp : Date.now();
    const messageId = smsId ? `msg-${smsId}` : `msg-${messages.length + 1}`;

    messages.push({
      id: messageId,
      sender: address || 'Unknown',
      preview: truncatePreview(body),
      thread: threadId || undefined,
      timestamp: timestamp && Number.isFinite(timestamp) ? timestamp : undefined,
      messageType,
    });

    restoreRecords.push({
      id: messageId,
      address: address || 'Unknown',
      body,
      date: normalizedDate,
      type: Number.isFinite(rawType) ? rawType : 1,
      read: Number.isFinite(rawRead ?? Number.NaN) ? rawRead : undefined,
      threadId: threadId || undefined,
      serviceCenter: serviceCenter || undefined,
      subId: subId || undefined,
    });
  }

  appendLog?.(`Messages scan: found ${messages.length} messages.`);
  return { entries: messages, restoreRecords };
}

export async function scanConnectedMessagesPreview(
  maxItems = MAX_PREVIEW_MESSAGES,
  appendLog?: (line: string) => void,
) {
  return (await collectDeviceMessages(maxItems, appendLog)).entries;
}

export async function backupMessagesToSnapshot(options: {
  snapshotPath: string;
  includeMessages: boolean;
  maxItems?: number;
  selectedIds?: Set<string>;
  appendLog?: (line: string) => void;
}) {
  if (!options.includeMessages) {
    return [] as BackupRestoreMessageEntry[];
  }

  const allMessages = await collectDeviceMessages(
    options.maxItems ?? MAX_BACKUP_MESSAGES,
    options.appendLog,
  );
  const messages =
    options.selectedIds && options.selectedIds.size > 0
      ? allMessages.entries.filter((message) => options.selectedIds?.has(message.id))
      : allMessages.entries;
  const restoreMessages =
    options.selectedIds && options.selectedIds.size > 0
      ? allMessages.restoreRecords.filter((message) => options.selectedIds?.has(message.id))
      : allMessages.restoreRecords;
  if (messages.length === 0) {
    return [] as BackupRestoreMessageEntry[];
  }

  const messagesDir = join(options.snapshotPath, 'messages');
  await mkdir(messagesDir, { recursive: true });
  await writeFile(join(messagesDir, 'messages.json'), JSON.stringify(messages, null, 2), 'utf8');
  await writeMessagesRestoreData(options.snapshotPath, restoreMessages);
  return messages;
}
