import type { RequestOptions } from '../../shared/types/index.ts';
import { API_URL, BASE_URL, USER_AGENT } from './constants.ts';
import { cookieJar, session } from './state.ts';

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
  const response = await fetch(`${BASE_URL}/lmsa-web/index.jsp`);
  updateCookies(response.headers);
}

export async function requestApi(path: string, body: unknown = {}, options: RequestOptions = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Request-Tag': 'lmsa',
    'User-Agent': USER_AGENT,
    ['Guid']: session.guid,
    ['Cookie']: serializeCookies(),
  });

  if (session.jwt) {
    headers.set('Authorization', session.jwt);
  }

  const payload = options.raw
    ? body
    : {
        client: { version: '7.4.3.4' },
        dparams: body,
        language: 'en-US',
        windowsInfo: 'Microsoft Windows 10 Pro, 64-bit',
      };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  updateCookies(response.headers);
  refreshAuth(response.headers);
  return response;
}
