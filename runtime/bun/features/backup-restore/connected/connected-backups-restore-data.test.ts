import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readContactsRestoreData,
  readMessagesRestoreData,
  writeContactsRestoreData,
  writeMessagesRestoreData,
} from './connected-backups-restore-data.ts';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = '';
  }
});

async function createSnapshotDir() {
  tempRoot = await mkdtemp(join(tmpdir(), 'lmfd-restore-data-'));
  return tempRoot;
}

describe('connected-backups-restore-data', () => {
  it('reads back raw contacts restore data', async () => {
    const snapshotPath = await createSnapshotDir();
    await writeContactsRestoreData(snapshotPath, [
      {
        id: 'contact-1',
        displayName: 'Alice',
        phones: [{ value: '+4512345678', type: 2 }],
        emails: [{ value: 'alice@example.com', type: 1 }],
      },
    ]);

    const contacts = await readContactsRestoreData(snapshotPath);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.displayName).toBe('Alice');
    expect(contacts[0]?.phones[0]?.value).toBe('+4512345678');
    expect(contacts[0]?.emails[0]?.value).toBe('alice@example.com');
  });

  it('falls back to legacy contacts json', async () => {
    const snapshotPath = await createSnapshotDir();
    await mkdir(join(snapshotPath, 'contacts'), { recursive: true });
    await Bun.write(
      join(snapshotPath, 'contacts', 'contacts.json'),
      JSON.stringify([
        {
          id: 'contact-legacy',
          displayName: 'Bob',
          phoneNumber: '5551234',
          email: 'bob@example.com',
        },
      ]),
    );

    const contacts = await readContactsRestoreData(snapshotPath);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.phones[0]?.value).toBe('5551234');
    expect(contacts[0]?.emails[0]?.value).toBe('bob@example.com');
  });

  it('filters placeholder NULL contacts from restore data', async () => {
    const snapshotPath = await createSnapshotDir();
    await writeContactsRestoreData(snapshotPath, [
      {
        id: 'contact-good',
        displayName: 'Alice',
        phones: [{ value: '+4512345678' }],
        emails: [],
      },
      {
        id: 'contact-null',
        displayName: 'NULL',
        phones: [],
        emails: [],
      },
    ]);

    const contacts = await readContactsRestoreData(snapshotPath);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.displayName).toBe('Alice');
  });

  it('reads back raw messages restore data', async () => {
    const snapshotPath = await createSnapshotDir();
    await writeMessagesRestoreData(snapshotPath, [
      {
        id: 'msg-1',
        address: '+4512345678',
        body: 'Full body',
        date: 1234567890,
        type: 1,
        read: 1,
      },
    ]);

    const messages = await readMessagesRestoreData(snapshotPath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe('Full body');
    expect(messages[0]?.address).toBe('+4512345678');
    expect(messages[0]?.type).toBe(1);
  });

  it('falls back to legacy messages json', async () => {
    const snapshotPath = await createSnapshotDir();
    await mkdir(join(snapshotPath, 'messages'), { recursive: true });
    await Bun.write(
      join(snapshotPath, 'messages', 'messages.json'),
      JSON.stringify([
        {
          id: 'msg-legacy',
          sender: 'Carol',
          preview: 'Legacy preview',
          timestamp: 42,
          messageType: 'received',
        },
      ]),
    );

    const messages = await readMessagesRestoreData(snapshotPath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe('Legacy preview');
    expect(messages[0]?.address).toBe('Carol');
    expect(messages[0]?.date).toBe(42);
  });
});
