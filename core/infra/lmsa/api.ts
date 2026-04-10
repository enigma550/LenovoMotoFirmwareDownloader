import type { RequestOptions } from '../../common/request-options.ts';
import { API_URL, BASE_URL, USER_AGENT } from './constants.ts';
import { cookieJar, session } from './state.ts';

const clientVersion = '7.5.5.19';
const requestLanguage = 'en-US';
const requestWindowsInfo = 'Microsoft Windows 10 Pro, 64-bit';

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
