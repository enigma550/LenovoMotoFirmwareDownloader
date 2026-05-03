import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PlayStoreArch } from '../../../shared/desktop-rpc';
import {
  buildAuroraDeviceConfig,
  buildCheckinRequest,
  buildDeviceConfiguration,
  buildPlayStoreAuthUserAgent,
  buildPlayStoreUserAgent,
  createPlayStoreDeviceProfile,
  type PlayStoreDeviceProfile,
} from './play-store-device.ts';
import { getCheckinProtoType, getGooglePlayProtoType, toPlainObject } from './play-store-proto.ts';

export type PlayStoreAuthProfileSource = 'env' | 'file' | 'dispenser';

export type PlayStoreAccount = {
  email: string;
  aasToken: string;
};

export type PlayStoreAuthProfiles = {
  accounts: PlayStoreAccount[];
  dispensers: string[];
  source?: PlayStoreAuthProfileSource;
  sourcePath?: string;
  error?: string;
};

export type PlayStoreSession = {
  account: PlayStoreAccount;
  arch: PlayStoreArch;
  authToken: string;
  deviceConfigToken: string;
  deviceConsistencyToken: string;
  dfeCookie: string;
  gsfId: string;
  locale: string;
  profile: PlayStoreDeviceProfile;
  userAgent: string;
};

export class PlayStoreAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayStoreAuthError';
  }
}

const AUTH_URL = 'https://android.clients.google.com/auth';
const CHECKIN_URL = 'https://android.clients.google.com/checkin';
const TOC_URL = 'https://android.clients.google.com/fdfe/toc';
const UPLOAD_DEVICE_CONFIG_URL = 'https://android.clients.google.com/fdfe/uploadDeviceConfig';
const GOOGLE_CLIENT_SIGNATURE = '38918a453d07199354f8b19af05ec6562ced5788';
const DEFAULT_DISPENSER_URL = 'https://auroraoss.com/api/auth';
const DISPENSER_USER_AGENT = 'com.aurora.store-4.8.2-74';
const DEFAULT_LOCALE = 'en-US';

const sessionCache = new Map<PlayStoreArch, PlayStoreSession>();
let nextAccountIndex = 0;

function toRequestBody(bytes: Uint8Array) {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

function getDefaultProfilesPath() {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(
      home,
      'Library',
      'Application Support',
      'com.github.enigma550.lenovomotofirmwaredownloader',
      'aurora-accounts.txt',
    );
  }

  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA || join(home, 'AppData', 'Roaming'),
      'com.github.enigma550.lenovomotofirmwaredownloader',
      'aurora-accounts.txt',
    );
  }

  return join(
    process.env.XDG_CONFIG_HOME || join(home, '.config'),
    'com.github.enigma550.lenovomotofirmwaredownloader',
    'aurora-accounts.txt',
  );
}

function parseAccountProfiles(rawValue: string) {
  const accounts: PlayStoreAccount[] = [];
  for (const rawLine of rawValue.split(/\r?\n|;/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const [email = '', ...tokenParts] = line.split(/\s+/);
    const aasToken = tokenParts.join('').trim();
    if (!email.includes('@') || !aasToken) {
      continue;
    }

    accounts.push({ aasToken, email });
  }

  return accounts;
}

function parseDispenserUrls(rawValue: string | undefined) {
  const normalized = rawValue?.trim() || DEFAULT_DISPENSER_URL;
  return normalized
    .split(/[\s,;]+/)
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter((url) => url.startsWith('https://'));
}

export async function getPlayStoreAuthProfiles(): Promise<PlayStoreAuthProfiles> {
  const envProfiles = process.env.LMFD_AURORA_ACCOUNTS?.trim();
  if (envProfiles) {
    const accounts = parseAccountProfiles(envProfiles);
    return accounts.length > 0
      ? { accounts, dispensers: [], source: 'env' }
      : {
          accounts: [],
          dispensers: [],
          error: 'LMFD_AURORA_ACCOUNTS is set, but no valid "email aas_token" profiles were found.',
          source: 'env',
        };
  }

  const explicitPath = process.env.LMFD_AURORA_ACCOUNTS_FILE?.trim();
  const sourcePath = explicitPath || getDefaultProfilesPath();
  if (existsSync(sourcePath)) {
    const rawFile = await readFile(sourcePath, 'utf8').catch((error: unknown) => {
      throw new PlayStoreAuthError(
        `Could not read Aurora auth profiles at ${sourcePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    const accounts = parseAccountProfiles(rawFile);
    if (accounts.length > 0) {
      return { accounts, dispensers: [], source: 'file', sourcePath };
    }
    if (explicitPath) {
      return {
        accounts: [],
        dispensers: [],
        error: `No valid "email aas_token" profiles were found in ${sourcePath}.`,
        source: 'file',
        sourcePath,
      };
    }
  }

  const dispensers = parseDispenserUrls(process.env.LMFD_AURORA_DISPENSERS);
  return dispensers.length > 0
    ? { accounts: [], dispensers, source: 'dispenser' }
    : {
        accounts: [],
        dispensers: [],
        error: 'No Aurora token dispensers are configured.',
        source: 'dispenser',
      };
}

function getStringField(record: Record<string, unknown>, name: string) {
  const value = record[name];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function longDecimalToHex(value: string) {
  if (!value) {
    return '';
  }
  try {
    return BigInt(value).toString(16);
  } catch {
    return value;
  }
}

async function fetchBytes(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    throw new PlayStoreAuthError(`Google Play auth request failed with HTTP ${response.status}.`);
  }
  return body;
}

async function checkInDevice(profile: PlayStoreDeviceProfile) {
  const checkinRequestType = await getCheckinProtoType('AndroidCheckinRequest');
  const checkinResponseType = await getCheckinProtoType('AndroidCheckinResponse');
  const request = checkinRequestType.create(buildCheckinRequest(profile));
  const encodedRequest = checkinRequestType.encode(request).finish();
  const headers = new Headers();
  headers.set('Host', 'android.clients.google.com');
  headers.set('Content-Type', 'application/x-protobuffer');
  headers.set('User-Agent', buildPlayStoreUserAgent(profile));
  headers.set('app', 'com.google.android.gms');

  const responseBytes = await fetchBytes(CHECKIN_URL, {
    body: toRequestBody(encodedRequest),
    headers,
    method: 'POST',
  });
  const decoded = toPlainObject(checkinResponseType, checkinResponseType.decode(responseBytes));
  const androidId = longDecimalToHex(getStringField(decoded, 'androidId'));
  if (!androidId) {
    throw new PlayStoreAuthError('Google Play check-in did not return an Android ID.');
  }

  return {
    deviceConsistencyToken: getStringField(decoded, 'deviceCheckinConsistencyToken'),
    gsfId: androidId,
  };
}

async function uploadDeviceConfig(options: {
  deviceConsistencyToken: string;
  gsfId: string;
  profile: PlayStoreDeviceProfile;
  userAgent: string;
}) {
  const uploadRequestType = await getGooglePlayProtoType('UploadDeviceConfigRequest');
  const responseWrapperType = await getGooglePlayProtoType('ResponseWrapper');
  const request = uploadRequestType.create({
    deviceConfiguration: buildDeviceConfiguration(options.profile),
  });
  const encodedRequest = uploadRequestType.encode(request).finish();
  const headers = new Headers();
  headers.set('Authorization', '');
  headers.set('Host', 'android.clients.google.com');
  headers.set('Content-Type', 'application/x-protobuf');
  headers.set('User-Agent', options.userAgent);
  headers.set('X-DFE-Client-Id', 'am-android-google');
  headers.set('X-DFE-Device-Id', options.gsfId);
  headers.set('X-DFE-MCCMNC', options.profile.mccMnc);
  headers.set('X-DFE-Network-Type', '4');
  headers.set('X-DFE-Request-Params', 'timeoutMs=4000');
  headers.set('X-DFE-UserLanguages', DEFAULT_LOCALE);
  if (options.deviceConsistencyToken) {
    headers.set('X-DFE-Device-Checkin-Consistency-Token', options.deviceConsistencyToken);
  }

  const responseBytes = await fetchBytes(UPLOAD_DEVICE_CONFIG_URL, {
    body: toRequestBody(encodedRequest),
    headers,
    method: 'POST',
  });

  const wrapper = toPlainObject(responseWrapperType, responseWrapperType.decode(responseBytes));
  const payload = wrapper['payload'] as Record<string, unknown> | undefined;
  const response = payload?.['uploadDeviceConfigResponse'] as Record<string, unknown> | undefined;
  const token =
    typeof response?.['uploadDeviceConfigToken'] === 'string'
      ? response['uploadDeviceConfigToken']
      : '';
  if (!token) {
    throw new PlayStoreAuthError('Google Play did not return a device config token.');
  }
  return token;
}

function parseAuthResponse(text: string) {
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    fields.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return fields;
}

async function exchangeAasTokenForAuth(options: {
  account: PlayStoreAccount;
  gsfId: string;
  profile: PlayStoreDeviceProfile;
}) {
  const body = new URLSearchParams();
  body.set('Email', options.account.email);
  body.set('Token', options.account.aasToken);
  body.set('androidId', options.gsfId);
  body.set('app', 'com.android.vending');
  body.set('callerPkg', 'com.google.android.gms');
  body.set('callerSig', GOOGLE_CLIENT_SIGNATURE);
  body.set('check_email', '1');
  body.set('client_sig', GOOGLE_CLIENT_SIGNATURE);
  body.set('device_country', 'US');
  body.set('droidguard_results', 'null');
  body.set('google_play_services_version', String(options.profile.gsfVersion));
  body.set('lang', 'en');
  body.set('oauth2_foreground', '1');
  body.set('sdk_version', String(options.profile.apiLevel));
  body.set('service', 'oauth2:https://www.googleapis.com/auth/googleplay');
  body.set('system_partition', '1');
  body.set('token_request_options', 'CAA4AVAB');
  const headers = new Headers();
  headers.set('Content-Type', 'application/x-www-form-urlencoded');
  headers.set('User-Agent', buildPlayStoreAuthUserAgent(options.profile));
  headers.set('app', 'com.google.android.gms');
  headers.set('device', options.gsfId);

  const response = await fetch(AUTH_URL, {
    body,
    headers,
    method: 'POST',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PlayStoreAuthError(`Google Play token exchange failed with HTTP ${response.status}.`);
  }

  const fields = parseAuthResponse(text);
  const authToken = fields.get('Auth') || '';
  if (!authToken) {
    const error = fields.get('Error') || text.trim() || 'Auth token was not returned.';
    throw new PlayStoreAuthError(`Google Play rejected the Aurora profile: ${error}`);
  }

  return authToken;
}

async function fetchDfeCookie(session: Omit<PlayStoreSession, 'dfeCookie'>) {
  const responseWrapperType = await getGooglePlayProtoType('ResponseWrapper');
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${session.authToken}`);
  headers.set('Host', 'android.clients.google.com');
  headers.set('User-Agent', session.userAgent);
  headers.set('X-DFE-Client-Id', 'am-android-google');
  headers.set('X-DFE-Device-Config-Token', session.deviceConfigToken);
  headers.set('X-DFE-Device-Id', session.gsfId);
  headers.set('X-DFE-MCCMNC', session.profile.mccMnc);
  headers.set('X-DFE-Network-Type', '4');
  headers.set('X-DFE-Request-Params', 'timeoutMs=4000');
  headers.set('X-DFE-UserLanguages', session.locale);
  if (session.deviceConsistencyToken) {
    headers.set('X-DFE-Device-Checkin-Consistency-Token', session.deviceConsistencyToken);
  }

  const response = await fetch(TOC_URL, {
    headers,
    method: 'GET',
  });
  const body = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    return '';
  }

  const wrapper = toPlainObject(responseWrapperType, responseWrapperType.decode(body));
  const payload = wrapper['payload'] as Record<string, unknown> | undefined;
  const toc = payload?.['tocResponse'] as Record<string, unknown> | undefined;
  return typeof toc?.['cookie'] === 'string' ? toc['cookie'] : '';
}

type DispenserAuthBundle = {
  auth?: string;
  authToken?: string;
  deviceCheckInConsistencyToken?: string;
  deviceConfigToken?: string;
  dfeCookie?: string;
  email?: string;
  gsfId?: string;
};

function readDispenserAuthBundle(value: unknown): DispenserAuthBundle {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const record = value as Record<string, unknown>;
  const readString = (key: keyof DispenserAuthBundle) =>
    typeof record[key] === 'string' ? record[key] : undefined;
  return {
    auth: readString('auth'),
    authToken: readString('authToken'),
    deviceCheckInConsistencyToken: readString('deviceCheckInConsistencyToken'),
    deviceConfigToken: readString('deviceConfigToken'),
    dfeCookie: readString('dfeCookie'),
    email: readString('email'),
    gsfId: readString('gsfId'),
  };
}

function cleanDispenserError(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  if (/<!doctype html|<html/i.test(trimmed)) {
    return 'The endpoint returned an HTML error page.';
  }
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

async function buildSessionFromAuthToken(options: {
  account: PlayStoreAccount;
  arch: PlayStoreArch;
  authToken: string;
  bootstrap?: Pick<
    PlayStoreSession,
    'deviceConfigToken' | 'deviceConsistencyToken' | 'dfeCookie' | 'gsfId'
  >;
}) {
  const profile = createPlayStoreDeviceProfile(options.arch);
  const userAgent = buildPlayStoreUserAgent(profile);
  let bootstrap = options.bootstrap;

  if (!bootstrap?.gsfId || !bootstrap.deviceConfigToken) {
    const checkin = await checkInDevice(profile);
    const deviceConfigToken = await uploadDeviceConfig({
      deviceConsistencyToken: checkin.deviceConsistencyToken,
      gsfId: checkin.gsfId,
      profile,
      userAgent,
    });
    bootstrap = {
      deviceConfigToken,
      deviceConsistencyToken: checkin.deviceConsistencyToken,
      dfeCookie: '',
      gsfId: checkin.gsfId,
    };
  }

  const sessionWithoutCookie = {
    account: options.account,
    arch: options.arch,
    authToken: options.authToken,
    deviceConfigToken: bootstrap.deviceConfigToken,
    deviceConsistencyToken: bootstrap.deviceConsistencyToken,
    gsfId: bootstrap.gsfId,
    locale: DEFAULT_LOCALE,
    profile,
    userAgent,
  } satisfies Omit<PlayStoreSession, 'dfeCookie'>;

  return {
    ...sessionWithoutCookie,
    dfeCookie: bootstrap.dfeCookie || (await fetchDfeCookie(sessionWithoutCookie)),
  } satisfies PlayStoreSession;
}

async function buildPlayStoreSession(account: PlayStoreAccount, arch: PlayStoreArch) {
  const profile = createPlayStoreDeviceProfile(arch);
  const checkin = await checkInDevice(profile);
  const deviceConfigToken = await uploadDeviceConfig({
    deviceConsistencyToken: checkin.deviceConsistencyToken,
    gsfId: checkin.gsfId,
    profile,
    userAgent: buildPlayStoreUserAgent(profile),
  });
  const authToken = await exchangeAasTokenForAuth({
    account,
    gsfId: checkin.gsfId,
    profile,
  });

  return buildSessionFromAuthToken({
    account,
    arch,
    authToken,
    bootstrap: {
      deviceConfigToken,
      deviceConsistencyToken: checkin.deviceConsistencyToken,
      dfeCookie: '',
      gsfId: checkin.gsfId,
    },
  });
}

async function fetchDispenserSession(dispenserUrl: string, arch: PlayStoreArch) {
  const profile = createPlayStoreDeviceProfile(arch);
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  headers.set('User-Agent', DISPENSER_USER_AGENT);

  let response = await fetch(`${dispenserUrl}?locale=${encodeURIComponent(DEFAULT_LOCALE)}`, {
    body: JSON.stringify(buildAuroraDeviceConfig(profile)),
    headers,
    method: 'POST',
  });
  let text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok && response.status === 400) {
    const fallbackHeaders = new Headers();
    fallbackHeaders.set('Accept', 'application/json');
    fallbackHeaders.set('User-Agent', DISPENSER_USER_AGENT);
    response = await fetch(`${dispenserUrl}?locale=${encodeURIComponent(DEFAULT_LOCALE)}`, {
      headers: fallbackHeaders,
      method: 'GET',
    });
    text = await response.text();
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const message =
      typeof record['error'] === 'string' ? record['error'] : cleanDispenserError(text);
    throw new PlayStoreAuthError(
      `Aurora token dispenser ${dispenserUrl} failed with HTTP ${response.status}${
        message ? `: ${message}` : ''
      }.`,
    );
  }

  const bundle = readDispenserAuthBundle(parsed);
  const authToken = bundle.authToken || bundle.auth || '';
  if (!authToken) {
    throw new PlayStoreAuthError(
      `Aurora token dispenser ${dispenserUrl} did not return authToken.`,
    );
  }

  return buildSessionFromAuthToken({
    account: {
      aasToken: '',
      email: bundle.email || 'anonymous@aurora.local',
    },
    arch,
    authToken,
    bootstrap:
      bundle.gsfId && bundle.deviceConfigToken
        ? {
            deviceConfigToken: bundle.deviceConfigToken,
            deviceConsistencyToken: bundle.deviceCheckInConsistencyToken || '',
            dfeCookie: bundle.dfeCookie || '',
            gsfId: bundle.gsfId,
          }
        : undefined,
  });
}

export function invalidatePlayStoreSession(arch?: PlayStoreArch) {
  if (arch) {
    sessionCache.delete(arch);
    return;
  }
  sessionCache.clear();
}

export async function getPlayStoreSession(arch: PlayStoreArch, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = sessionCache.get(arch);
    if (cached) {
      return cached;
    }
  }

  const profiles = await getPlayStoreAuthProfiles();
  let lastError = '';
  if (profiles.accounts.length > 0) {
    for (let offset = 0; offset < profiles.accounts.length; offset += 1) {
      const index = (nextAccountIndex + offset) % profiles.accounts.length;
      const account = profiles.accounts[index];
      if (!account) {
        continue;
      }

      try {
        const session = await buildPlayStoreSession(account, arch);
        nextAccountIndex = (index + 1) % profiles.accounts.length;
        sessionCache.set(arch, session);
        return session;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  for (const dispenserUrl of profiles.dispensers) {
    try {
      const session = await fetchDispenserSession(dispenserUrl, arch);
      sessionCache.set(arch, session);
      return session;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new PlayStoreAuthError(
    lastError || profiles.error || 'No Aurora token dispenser or auth profile is available.',
  );
}

export async function ensureDefaultAuroraProfilesDirectory() {
  const sourcePath = process.env.LMFD_AURORA_ACCOUNTS_FILE?.trim() || getDefaultProfilesPath();
  await mkdir(dirname(sourcePath), { recursive: true });
  return sourcePath;
}
