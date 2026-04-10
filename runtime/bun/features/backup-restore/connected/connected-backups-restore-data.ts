import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { asRecord, type JsonObject, type JsonValue } from '../../../firmware-package-utils.ts';

export type RestoreContactPhone = {
  value: string;
  type?: number;
  label?: string;
};

export type RestoreContactEmail = {
  value: string;
  type?: number;
  label?: string;
};

export type RestoreContactRecord = {
  id: string;
  displayName: string;
  phones: RestoreContactPhone[];
  emails: RestoreContactEmail[];
};

export type RestoreMessageRecord = {
  id: string;
  address: string;
  body: string;
  date: number;
  type: number;
  read?: number;
  threadId?: string;
  serviceCenter?: string;
  subId?: string;
};

function readString(value: JsonValue | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isRestorableContactDisplayName(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.toUpperCase() !== 'NULL';
}

function readOptionalNumber(value: JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArrayField(record: JsonObject | null, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

export async function writeContactsRestoreData(
  snapshotPath: string,
  contacts: RestoreContactRecord[],
) {
  const contactsDir = join(snapshotPath, 'contacts');
  await mkdir(contactsDir, { recursive: true });
  await writeFile(
    join(contactsDir, 'contacts.restore.json'),
    JSON.stringify(contacts, null, 2),
    'utf8',
  );
}

export async function writeMessagesRestoreData(
  snapshotPath: string,
  messages: RestoreMessageRecord[],
) {
  const messagesDir = join(snapshotPath, 'messages');
  await mkdir(messagesDir, { recursive: true });
  await writeFile(
    join(messagesDir, 'messages.restore.json'),
    JSON.stringify(messages, null, 2),
    'utf8',
  );
}

function parseRestoreContactRecord(value: JsonValue, index: number): RestoreContactRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const displayName = readString(record.displayName) || readString(record.name);
  if (!isRestorableContactDisplayName(displayName)) {
    return null;
  }

  const phones = readStringArrayField(record, 'phones')
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonObject => entry !== null)
    .map((entry) => ({
      value: readString(entry.value) || readString(entry.number) || readString(entry.phoneNumber),
      type: readOptionalNumber(entry.type),
      label: readString(entry.label) || undefined,
    }))
    .filter((entry) => entry.value.length > 0);

  const emails = readStringArrayField(record, 'emails')
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonObject => entry !== null)
    .map((entry) => ({
      value: readString(entry.value) || readString(entry.address) || readString(entry.email),
      type: readOptionalNumber(entry.type),
      label: readString(entry.label) || undefined,
    }))
    .filter((entry) => entry.value.length > 0);

  return {
    id: readString(record.id) || `contact-${index + 1}`,
    displayName,
    phones,
    emails,
  };
}

function parseLegacyContactRecord(value: JsonValue, index: number): RestoreContactRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const displayName = readString(record.displayName) || readString(record.name);
  if (!isRestorableContactDisplayName(displayName)) {
    return null;
  }

  const phone = readString(record.phoneNumber) || readString(record.phone);
  const email = readString(record.email);

  return {
    id: readString(record.id) || `contact-${index + 1}`,
    displayName,
    phones: phone ? [{ value: phone }] : [],
    emails: email ? [{ value: email }] : [],
  };
}

function parseRestoreMessageRecord(value: JsonValue, index: number): RestoreMessageRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const body = readString(record.body) || readString(record.preview) || readString(record.text);
  if (!body) {
    return null;
  }

  const type = readOptionalNumber(record.type) ?? 1;
  const date =
    readOptionalNumber(record.date) ?? readOptionalNumber(record.timestamp) ?? Date.now();

  return {
    id: readString(record.id) || `msg-${index + 1}`,
    address: readString(record.address) || readString(record.sender) || 'Unknown',
    body,
    date,
    type,
    read: readOptionalNumber(record.read),
    threadId: readString(record.threadId) || readString(record.thread) || undefined,
    serviceCenter: readString(record.serviceCenter) || undefined,
    subId: readString(record.subId) || undefined,
  };
}

export async function readContactsRestoreData(snapshotPath: string) {
  const restoreFile = Bun.file(join(snapshotPath, 'contacts', 'contacts.restore.json'));
  if (await restoreFile.exists()) {
    const payload = (await restoreFile.json()) as JsonValue;
    if (Array.isArray(payload)) {
      return payload
        .map((item, index) => parseRestoreContactRecord(item, index))
        .filter((item): item is RestoreContactRecord => item !== null);
    }
  }

  const legacyFile = Bun.file(join(snapshotPath, 'contacts', 'contacts.json'));
  if (!(await legacyFile.exists())) {
    return [] as RestoreContactRecord[];
  }

  const payload = (await legacyFile.json()) as JsonValue;
  if (!Array.isArray(payload)) {
    return [] as RestoreContactRecord[];
  }

  return payload
    .map((item, index) => parseLegacyContactRecord(item, index))
    .filter((item): item is RestoreContactRecord => item !== null);
}

export async function readMessagesRestoreData(snapshotPath: string) {
  const restoreFile = Bun.file(join(snapshotPath, 'messages', 'messages.restore.json'));
  if (await restoreFile.exists()) {
    const payload = (await restoreFile.json()) as JsonValue;
    if (Array.isArray(payload)) {
      return payload
        .map((item, index) => parseRestoreMessageRecord(item, index))
        .filter((item): item is RestoreMessageRecord => item !== null);
    }
  }

  const legacyFile = Bun.file(join(snapshotPath, 'messages', 'messages.json'));
  if (!(await legacyFile.exists())) {
    return [] as RestoreMessageRecord[];
  }

  const payload = (await legacyFile.json()) as JsonValue;
  if (!Array.isArray(payload)) {
    return [] as RestoreMessageRecord[];
  }

  return payload
    .map((item, index) => parseRestoreMessageRecord(item, index))
    .filter((item): item is RestoreMessageRecord => item !== null);
}
