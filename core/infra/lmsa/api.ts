import { constants as cryptoConstants, publicEncrypt } from 'node:crypto';
import type { RequestOptions } from '../../common/request-options.ts';
import { API_URL, BASE_URL, USER_AGENT } from './constants.ts';
import { cookieJar, session } from './state.ts';

const clientVersion = '7.5.5.19';
const requestLanguage = 'en-US';
const requestWindowsInfo = 'Microsoft Windows 10 Pro, 64-bit';
const PUBLIC_KEY_PATH = '/common/rsa.jhtml';

let fingerprintPublicKeyPem: string | null = null;

async function loadFingerprintPublicKey() {
  if (fingerprintPublicKeyPem) return fingerprintPublicKeyPem;

  const response = await fetch(`${API_URL}${PUBLIC_KEY_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Request-Tag': 'lmsa',
      'User-Agent': USER_AGENT,
      ['Guid']: session.guid,
      clientVersion,
    },
    body: '{}',
  });
  const data = (await response.json()) as { desc?: unknown };
  const base64Key = typeof data.desc === 'string' ? data.desc.trim() : '';
  if (!base64Key) return null;

  const lines = base64Key.match(/.{1,64}/g)?.join('\n') ?? base64Key;
  fingerprintPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
  return fingerprintPublicKeyPem;
}

// Mirrors the official client: last URL segment with its extension replaced by "interface".
function getLastSegmentForFingerprint(url: string) {
  const parts = url.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (!lastPart) return '';
  const dotIndex = lastPart.lastIndexOf('.');
  return dotIndex > 0 ? `${lastPart.slice(0, dotIndex)}interface` : lastPart;
}

// Lenovo gateway requires X-Device-Fingerprint = base64(RSA_PKCS1v15("<unixMs>|<Authorization>|<segment>")).
async function createDeviceFingerprint(url: string, authorization: string) {
  if (url.endsWith(PUBLIC_KEY_PATH)) return '';

  try {
    const publicKey = await loadFingerprintPublicKey();
    if (!publicKey) return '';

    const plainText = `${Date.now()}|${authorization}|${getLastSegmentForFingerprint(url)}`;
    return publicEncrypt(
      { key: publicKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(plainText, 'utf8'),
    ).toString('base64');
  } catch (error) {
    console.warn('[LMSA] Failed to create device fingerprint:', error);
    return '';
  }
}

function serializeCookies() {
  return [...cookieJar.entries()]
    .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
    .join('; ');
}

function getSetCookieValues(headers: Headers) {
  const headersWithGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === 'function') {
    return headersWithGetSetCookie.getSetCookie();
  }

  const setCookieValue = headers.get('set-cookie');
  return setCookieValue ? [setCookieValue] : [];
}

function updateCookies(headers: Headers) {
  for (const cookieLine of getSetCookieValues(headers)) {
    const [cookiePair] = cookieLine.split(';');
    if (!cookiePair) continue;

    const splitAt = cookiePair.indexOf('=');
    if (splitAt <= 0) continue;

    const cookieName = cookiePair.slice(0, splitAt).trim();
    const cookieValue = cookiePair.slice(splitAt + 1).trim();
    if (cookieName && cookieValue) {
      cookieJar.set(cookieName, cookieValue);
    }
  }
}

function refreshAuth(headers: Headers) {
  const authorizationHeader = headers.get('Authorization');
  const responseGuid = headers.get('Guid');
  if (!authorizationHeader) return;
  if (responseGuid && responseGuid !== session.guid) return;

  session.jwt = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader
    : `Bearer ${authorizationHeader}`;
}

export async function bootstrapSessionCookie() {
  const response = await fetch(`${BASE_URL}/lmsa-web/index.jsp`, { redirect: 'manual' });
  updateCookies(response.headers);
}

type ApiRequestBody = BodyInit | object;

function isBodyInit(value: ApiRequestBody): value is BodyInit {
  return (
    typeof value === 'string' ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream
  );
}

function buildRequestBody(
  body: ApiRequestBody,
  payload: ApiRequestBody,
  isGet: boolean,
  isFormUrlEncoded: boolean,
) {
  if (isGet) {
    return undefined;
  }

  if (isFormUrlEncoded) {
    if (isBodyInit(body)) {
      return body;
    }

    const formBody = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value === null || value === undefined) {
        continue;
      }
      formBody.set(key, String(value));
    }
    return formBody;
  }

  return JSON.stringify(payload);
}

export async function requestApi(
  path: string,
  body: ApiRequestBody = {},
  options: RequestOptions = {},
) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const isFormUrlEncoded =
    options.headers?.['Content-Type'] === 'application/x-www-form-urlencoded';

  const headers = new Headers({
    'Content-Type': options.headers?.['Content-Type'] || 'application/json',
    'Request-Tag': 'lmsa',
    'User-Agent': USER_AGENT,
    ['Guid']: session.guid,
    ['Cookie']: serializeCookies(),
    clientVersion,
    language: requestLanguage,
    windowsInfo: Buffer.from(requestWindowsInfo).toString('base64'),
  });

  if (session.clientUuid) {
    headers.set('clientUUID', session.clientUuid);
  }

  if (!options.withoutAuth && session.jwt) {
    headers.set('Authorization', session.jwt);
  }

  const authorizationHeader = headers.get('Authorization');
  if (authorizationHeader) {
    const deviceFingerprint = await createDeviceFingerprint(url, authorizationHeader);
    if (deviceFingerprint) {
      headers.set('X-Device-Fingerprint', deviceFingerprint);
    }
  }

  const payload = options.raw
    ? body
    : {
        client: {
          version: clientVersion,
        },
        language: requestLanguage,
        windowsInfo: requestWindowsInfo,
        dparams: body,
      };

  const isGet = (options.method || 'POST').toUpperCase() === 'GET';

  const response = await fetch(url, {
    method: options.method || 'POST',
    headers,
    body: buildRequestBody(body, payload, isGet, isFormUrlEncoded),
  });

  updateCookies(response.headers);
  refreshAuth(response.headers);
  return response;
}
