import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupRestoreContactEntry } from '../../../../shared/desktop-rpc';
import { runCommand } from './connected-backups-adb.ts';
import {
  normalizeContentQueryValue,
  parseContentQueryRows,
  readContentQueryFirstValue,
} from './connected-backups-content-query.ts';
import {
  isRestorableContactDisplayName,
  type RestoreContactRecord,
  writeContactsRestoreData,
} from './connected-backups-restore-data.ts';
import { MAX_BACKUP_CONTACTS, MAX_PREVIEW_CONTACTS } from './connected-backups-shared.ts';

type ContactAccumulator = {
  id: string;
  displayName: string;
  phones: Array<{
    value: string;
    type?: number;
    label?: string;
  }>;
  emails: Array<{
    value: string;
    type?: number;
    label?: string;
  }>;
};

function toContactEntries(values: ContactAccumulator[], maxItems: number) {
  return values
    .filter((item) => isRestorableContactDisplayName(item.displayName))
    .slice(0, Math.max(1, maxItems))
    .map((item, index) => ({
      id: item.id || `contact-${index + 1}`,
      displayName: item.displayName,
      phoneNumber: item.phones[0]?.value || undefined,
      email: item.emails[0]?.value || undefined,
    }));
}

function toRestoreContactRecords(values: ContactAccumulator[]) {
  return values
    .filter((item) => isRestorableContactDisplayName(item.displayName))
    .map((item, index) => ({
      id: item.id || `contact-${index + 1}`,
      displayName: item.displayName,
      phones: item.phones.map((entry) => ({ ...entry })),
      emails: item.emails.map((entry) => ({ ...entry })),
    })) satisfies RestoreContactRecord[];
}

async function queryPhoneRows(appendLog?: (line: string) => void) {
  const result = await runCommand(
    'adb',
    [
      'shell',
      'content query --uri content://com.android.contacts/data/phones --projection contact_id:display_name:data1:data2:data3',
    ],
    120_000,
  );
  if (result.stderrText.trim()) {
    appendLog?.(`Contacts phone stderr: ${result.stderrText.trim().slice(0, 200)}`);
  }
  return result;
}

async function queryContactsRows(appendLog?: (line: string) => void) {
  const result = await runCommand(
    'adb',
    [
      'shell',
      'content query --uri content://com.android.contacts/contacts --projection _id:display_name',
    ],
    120_000,
  );
  if (result.stderrText.trim()) {
    appendLog?.(`Contacts query stderr: ${result.stderrText.trim().slice(0, 200)}`);
  }
  return result;
}

async function queryEmailRows(appendLog?: (line: string) => void) {
  const result = await runCommand(
    'adb',
    [
      'shell',
      'content query --uri content://com.android.contacts/data/emails --projection contact_id:display_name:data1:data2:data3',
    ],
    120_000,
  );
  if (result.stderrText.trim()) {
    appendLog?.(`Contacts email stderr: ${result.stderrText.trim().slice(0, 200)}`);
  }
  return result;
}

async function collectDeviceContactData(maxItems: number, appendLog?: (line: string) => void) {
  const byId = new Map<string, ContactAccumulator>();
  let succeededQueries = 0;

  const contactsResult = await queryContactsRows(appendLog);
  if (contactsResult.exitCode === 0) {
    succeededQueries += 1;
    for (const row of parseContentQueryRows(contactsResult.stdoutText)) {
      const contactId = readContentQueryFirstValue(row, ['_id', 'contact_id']);
      const displayName = readContentQueryFirstValue(row, ['display_name']) || 'Unknown contact';
      if (!isRestorableContactDisplayName(displayName)) {
        continue;
      }
      const key = contactId || displayName.toLowerCase();
      if (!key) {
        continue;
      }

      if (byId.has(key)) {
        continue;
      }

      byId.set(key, {
        id: contactId ? `contact-${contactId}` : `contact-${byId.size + 1}`,
        displayName,
        phones: [],
        emails: [],
      });
    }
  }

  const phoneResult = await queryPhoneRows(appendLog);
  if (phoneResult.exitCode === 0) {
    succeededQueries += 1;
  }

  for (const row of parseContentQueryRows(phoneResult.stdoutText)) {
    const contactId = readContentQueryFirstValue(row, ['contact_id', '_id']);
    const displayName = readContentQueryFirstValue(row, ['display_name']) || 'Unknown contact';
    if (!isRestorableContactDisplayName(displayName)) {
      continue;
    }
    const phoneNumber = readContentQueryFirstValue(row, ['data1', 'number']);
    const phoneType = readContentQueryFirstValue(row, ['data2']);
    const phoneLabel = readContentQueryFirstValue(row, ['data3']);
    const key = contactId || displayName.toLowerCase();
    if (!key) {
      continue;
    }

    const existing = byId.get(key);
    if (existing) {
      if (phoneNumber && !existing.phones.some((entry) => entry.value === phoneNumber)) {
        existing.phones.push({
          value: phoneNumber,
          type: phoneType ? Number.parseInt(phoneType, 10) : undefined,
          label: phoneLabel || undefined,
        });
      }
      if (!existing.displayName && displayName) {
        existing.displayName = displayName;
      }
      continue;
    }

    byId.set(key, {
      id: contactId ? `contact-${contactId}` : `contact-${byId.size + 1}`,
      displayName,
      phones: phoneNumber
        ? [
            {
              value: phoneNumber,
              type: phoneType ? Number.parseInt(phoneType, 10) : undefined,
              label: phoneLabel || undefined,
            },
          ]
        : [],
      emails: [],
    });
  }

  const emailResult = await queryEmailRows(appendLog);
  if (emailResult.exitCode === 0) {
    succeededQueries += 1;
    for (const row of parseContentQueryRows(emailResult.stdoutText)) {
      const contactId = readContentQueryFirstValue(row, ['contact_id', '_id']);
      const displayName = readContentQueryFirstValue(row, ['display_name']) || 'Unknown contact';
      if (!isRestorableContactDisplayName(displayName)) {
        continue;
      }
      const email = normalizeContentQueryValue(row.data1);
      const emailType = readContentQueryFirstValue(row, ['data2']);
      const emailLabel = readContentQueryFirstValue(row, ['data3']);
      const key = contactId || displayName.toLowerCase();
      if (!key) {
        continue;
      }

      const existing = byId.get(key);
      if (existing) {
        if (email && !existing.emails.some((entry) => entry.value === email)) {
          existing.emails.push({
            value: email,
            type: emailType ? Number.parseInt(emailType, 10) : undefined,
            label: emailLabel || undefined,
          });
        }
        continue;
      }

      byId.set(key, {
        id: contactId ? `contact-${contactId}` : `contact-${byId.size + 1}`,
        displayName,
        phones: [],
        emails: email
          ? [
              {
                value: email,
                type: emailType ? Number.parseInt(emailType, 10) : undefined,
                label: emailLabel || undefined,
              },
            ]
          : [],
      });
    }
  }

  if (succeededQueries === 0) {
    appendLog?.('Contacts scan: unable to query contacts provider.');
    return [] as ContactAccumulator[];
  }

  const contacts = Array.from(byId.values())
    .filter((item) => isRestorableContactDisplayName(item.displayName))
    .slice(0, Math.max(1, maxItems));
  appendLog?.(`Contacts scan: found ${contacts.length} contacts.`);
  return contacts;
}

export async function scanConnectedContactsPreview(
  maxItems = MAX_PREVIEW_CONTACTS,
  appendLog?: (line: string) => void,
) {
  const contacts = await collectDeviceContactData(maxItems, appendLog);
  return toContactEntries(contacts, maxItems);
}

function escapeVcfValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function contactsToVcf(contacts: BackupRestoreContactEntry[]) {
  const cards: string[] = [];
  for (const contact of contacts) {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcfValue(contact.displayName)}`];
    if (contact.phoneNumber) {
      lines.push(`TEL:${contact.phoneNumber}`);
    }
    if (contact.email) {
      lines.push(`EMAIL:${contact.email}`);
    }
    lines.push('END:VCARD');
    cards.push(lines.join('\r\n'));
  }
  return cards.join('\r\n');
}

export async function backupContactsToSnapshot(options: {
  snapshotPath: string;
  includeContacts: boolean;
  maxItems?: number;
  selectedIds?: Set<string>;
  appendLog?: (line: string) => void;
}) {
  if (!options.includeContacts) {
    return [] as BackupRestoreContactEntry[];
  }

  const allContacts = await collectDeviceContactData(
    options.maxItems ?? MAX_BACKUP_CONTACTS,
    options.appendLog,
  );
  const contactEntries = toContactEntries(allContacts, options.maxItems ?? MAX_BACKUP_CONTACTS);
  const allRestoreContacts = toRestoreContactRecords(allContacts);
  const contacts =
    options.selectedIds && options.selectedIds.size > 0
      ? contactEntries.filter((contact) => options.selectedIds?.has(contact.id))
      : contactEntries;
  const restoreContacts =
    options.selectedIds && options.selectedIds.size > 0
      ? allRestoreContacts.filter((contact) => options.selectedIds?.has(contact.id))
      : allRestoreContacts;
  if (contacts.length === 0) {
    return [] as BackupRestoreContactEntry[];
  }

  const contactsDir = join(options.snapshotPath, 'contacts');
  await mkdir(contactsDir, { recursive: true });
  await writeFile(join(contactsDir, 'contacts.json'), JSON.stringify(contacts, null, 2), 'utf8');
  await writeFile(join(contactsDir, 'contacts.vcf'), contactsToVcf(contacts), 'utf8');
  await writeContactsRestoreData(options.snapshotPath, restoreContacts);
  options.appendLog?.(`Contacts backup: wrote ${contacts.length} contacts (JSON + VCF).`);
  return contacts;
}
