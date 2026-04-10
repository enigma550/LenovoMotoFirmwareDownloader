import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, hostname, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import type { AdbCredentialStore, AdbPrivateKey } from '@yume-chan/adb';
import { importTangoAdb } from './tango-bun-compat.ts';

const DEFAULT_KEY_NAME = 'LenovoMotoFirmwareDownloader';
const DEFAULT_KEY_FILE_PATH = join(homedir(), '.android', 'adbkey');
const LEGACY_KEY_FILE_PATH = join(process.cwd(), '.tmp', 'tango-adb', 'adb-key.json');
const PRIVATE_KEY_HEADER = '-----BEGIN PRIVATE KEY-----';
const PRIVATE_KEY_FOOTER = '-----END PRIVATE KEY-----';

type StoredAdbKeyRecord = {
  pkcs8: string;
  name?: string;
};

function getDefaultKeyName() {
  try {
    return `${userInfo().username}@${hostname()}`;
  } catch {
    return DEFAULT_KEY_NAME;
  }
}

function encodePem(pkcs8: Uint8Array) {
  const base64 = Buffer.from(pkcs8).toString('base64');
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `${PRIVATE_KEY_HEADER}\n${lines.join('\n')}\n${PRIVATE_KEY_FOOTER}\n`;
}

function decodePem(content: string) {
  const base64 = content
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  if (!base64) {
    return undefined;
  }

  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function parsePublicKeyName(content: string) {
  const line = content
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  if (!line) {
    return undefined;
  }

  const separatorIndex = line.indexOf(' ');
  if (separatorIndex === -1) {
    return undefined;
  }

  const name = line.slice(separatorIndex + 1).trim();
  return name || undefined;
}

async function encodePublicKey(privateKey: Uint8Array, name: string) {
  const { adbGeneratePublicKey } = await importTangoAdb();
  const publicKey = adbGeneratePublicKey(privateKey);
  const base64 = Buffer.from(publicKey).toString('base64');
  return `${base64}${name ? ` ${name}` : ''}\n`;
}

export class FileBackedAdbCredentialStore implements AdbCredentialStore {
  private cachedKey?: AdbPrivateKey;

  constructor(private readonly keyFilePath = DEFAULT_KEY_FILE_PATH) {}

  async generateKey(): Promise<AdbPrivateKey> {
    if (this.cachedKey) {
      return this.cachedKey;
    }

    const generatedKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-1',
      },
      true,
      ['sign', 'verify'],
    );

    if (!('privateKey' in generatedKeyPair)) {
      throw new Error('Failed to generate an ADB private key.');
    }

    const key: AdbPrivateKey = {
      buffer: new Uint8Array(await crypto.subtle.exportKey('pkcs8', generatedKeyPair.privateKey)),
      name: getDefaultKeyName(),
    };

    await this.persistKey(key);
    this.cachedKey = key;
    return key;
  }

  async *iterateKeys(): AsyncGenerator<AdbPrivateKey, void, void> {
    if (!this.cachedKey) {
      this.cachedKey = await this.loadKey();
    }

    if (!this.cachedKey) {
      this.cachedKey = await this.loadLegacyKey();
      if (this.cachedKey) {
        await this.persistKey(this.cachedKey);
      }
    }

    if (this.cachedKey) {
      yield this.cachedKey;
    }
  }

  private async loadKey(): Promise<AdbPrivateKey | undefined> {
    try {
      const privateKeyPem = await readFile(this.keyFilePath, 'utf8');
      const buffer = decodePem(privateKeyPem);
      if (!buffer) {
        return undefined;
      }

      let name = getDefaultKeyName();
      try {
        const publicKeyContent = await readFile(this.getPublicKeyPath(), 'utf8');
        name = parsePublicKeyName(publicKeyContent) || name;
      } catch {}

      return { buffer, name };
    } catch {
      return undefined;
    }
  }

  private async loadLegacyKey(): Promise<AdbPrivateKey | undefined> {
    try {
      const raw = await readFile(LEGACY_KEY_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StoredAdbKeyRecord;
      if (!parsed.pkcs8) {
        return undefined;
      }

      return {
        buffer: new Uint8Array(Buffer.from(parsed.pkcs8, 'base64')),
        name: parsed.name || getDefaultKeyName(),
      };
    } catch {
      return undefined;
    }
  }

  private async persistKey(key: AdbPrivateKey) {
    const privateKeyPath = this.keyFilePath;
    const publicKeyPath = this.getPublicKeyPath();
    const keyName = key.name || getDefaultKeyName();

    await mkdir(dirname(privateKeyPath), { recursive: true, mode: 0o750 });
    await writeFile(privateKeyPath, encodePem(key.buffer), { encoding: 'utf8', mode: 0o600 });
    await chmod(privateKeyPath, 0o600).catch(() => {});

    await writeFile(publicKeyPath, await encodePublicKey(key.buffer, keyName), {
      encoding: 'utf8',
      mode: 0o644,
    });
    await chmod(publicKeyPath, 0o644).catch(() => {});
  }

  private getPublicKeyPath() {
    return `${this.keyFilePath}.pub`;
  }
}
