import type { AppConfig } from '../../common/app-config.ts';
import type { JsonObject, JsonValue } from '../../common/json.ts';
import { loadConfig, saveConfig } from '../../infra/config.ts';
import { bootstrapSessionCookie, requestApi } from '../../infra/lmsa/api.ts';
import { cookieJar, session } from '../../infra/lmsa/state.ts';

interface BasicApiResponse {
  code?: string;
  desc?: string;
  msg?: string;
  content?: JsonValue;
}

interface PendingOauthContext {
  cookieEntries: Array<[string, string]>;
  createdAtMs: number;
  guid?: string;
  clientUuid?: string;
}

const pendingOauthContexts = new Map<string, PendingOauthContext>();
const MAX_PENDING_OAUTH_CONTEXTS = 10;
const PENDING_OAUTH_CONTEXT_TTL_MS = 30 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let pendingOauthContextsLoaded = false;
type SessionUuid = (typeof session)['guid'];

function toJsonObject(value: JsonValue | null | undefined): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function extractStateFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get('state')?.trim() || '';
  } catch {
    return '';
  }
}

function isPendingOauthContext(value: unknown): value is PendingOauthContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as {
    createdAtMs?: unknown;
    cookieEntries?: unknown;
    guid?: unknown;
    clientUuid?: unknown;
  };

  if (typeof candidate.createdAtMs !== 'number') return false;
  if (!Array.isArray(candidate.cookieEntries)) return false;
  if (candidate.guid !== undefined && typeof candidate.guid !== 'string') return false;
  if (candidate.clientUuid !== undefined && typeof candidate.clientUuid !== 'string') return false;

  return candidate.cookieEntries.every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'string',
  );
}

function isContextExpired(createdAtMs: number) {
  return Date.now() - createdAtMs > PENDING_OAUTH_CONTEXT_TTL_MS;
}

function applyCookieEntries(cookieEntries: Array<[string, string]>) {
  cookieJar.clear();
  for (const [cookieName, cookieValue] of cookieEntries) {
    cookieJar.set(cookieName, cookieValue);
  }
}

function isSessionUuid(value: string): value is SessionUuid {
  return UUID_PATTERN.test(value);
}

function applySessionIdentifiers(context: PendingOauthContext) {
  if (typeof context.guid === 'string' && isSessionUuid(context.guid)) {
    session.guid = context.guid;
  }
  if (typeof context.clientUuid === 'string' && isSessionUuid(context.clientUuid)) {
    session.clientUuid = context.clientUuid;
  }
}

function applyPendingOauthContext(context: PendingOauthContext) {
  applySessionIdentifiers(context);
  applyCookieEntries(context.cookieEntries);
}

function prunePendingOauthContexts() {
  for (const [state, context] of pendingOauthContexts.entries()) {
    if (isContextExpired(context.createdAtMs)) {
      pendingOauthContexts.delete(state);
    }
  }

  if (pendingOauthContexts.size <= MAX_PENDING_OAUTH_CONTEXTS) {
    return;
  }

  const oldestState = Array.from(pendingOauthContexts.entries()).sort(
    (left, right) => left[1].createdAtMs - right[1].createdAtMs,
  )[0]?.[0];

  if (oldestState) {
    pendingOauthContexts.delete(oldestState);
  }
}

async function loadPendingOauthContextsFromConfig() {
  if (pendingOauthContextsLoaded) return;
  pendingOauthContextsLoaded = true;

  const config = await loadConfig();
  const persistedContexts = config.pendingOauthContexts;
  if (!Array.isArray(persistedContexts)) return;

  for (const contextEntry of persistedContexts) {
    if (!contextEntry || typeof contextEntry !== 'object') continue;
    const candidate = contextEntry as {
      state?: unknown;
      context?: unknown;
      cookieEntries?: unknown;
      createdAtMs?: unknown;
      guid?: unknown;
      clientUuid?: unknown;
    };

    if (typeof candidate.state !== 'string' || !candidate.state) continue;

    const directContext: unknown = {
      cookieEntries: candidate.cookieEntries,
      createdAtMs: candidate.createdAtMs,
      guid: candidate.guid,
      clientUuid: candidate.clientUuid,
    };
    const wrappedContext = candidate.context;
    const normalizedContext = isPendingOauthContext(wrappedContext)
      ? wrappedContext
      : isPendingOauthContext(directContext)
        ? (directContext as PendingOauthContext)
        : null;

    if (!normalizedContext || isContextExpired(normalizedContext.createdAtMs)) {
      continue;
    }

    pendingOauthContexts.set(candidate.state, normalizedContext);
  }

  prunePendingOauthContexts();
}

async function persistPendingOauthContextsToConfig() {
  const config = await loadConfig();
  prunePendingOauthContexts();

  if (pendingOauthContexts.size === 0) {
    delete config.pendingOauthContexts;
    await saveConfig(config);
    return;
  }

  config.pendingOauthContexts = Array.from(pendingOauthContexts.entries()).map(
    ([state, context]) => ({
      state,
      cookieEntries: context.cookieEntries,
      createdAtMs: context.createdAtMs,
      guid: context.guid,
      clientUuid: context.clientUuid,
    }),
  );
  await saveConfig(config);
}

async function rememberOauthContext(loginUrl: string) {
  await loadPendingOauthContextsFromConfig();
  const state = extractStateFromUrl(loginUrl);
  if (!state) return;

  pendingOauthContexts.set(state, {
    cookieEntries: Array.from(cookieJar.entries()),
    createdAtMs: Date.now(),
    guid: session.guid,
    clientUuid: session.clientUuid,
  });

  prunePendingOauthContexts();
  await persistPendingOauthContextsToConfig();
}

function restoreOauthContext(state: string) {
  const pendingContext = pendingOauthContexts.get(state);
  if (!pendingContext || isContextExpired(pendingContext.createdAtMs)) return false;

  applyPendingOauthContext(pendingContext);
  return true;
}

async function removeOauthContext(state: string) {
  if (!state) return;
  if (!pendingOauthContexts.has(state)) return;

  pendingOauthContexts.delete(state);
  await persistPendingOauthContextsToConfig();
}

function isOauthStateNotFound(protocolUrl: string, responseText: string) {
  return (
    protocolUrl.includes('error=oauth2 state not found') ||
    responseText.includes('error=oauth2 state not found')
  );
}

function isOauthTokenError(protocolUrl: string, responseText: string) {
  return (
    protocolUrl.includes('error=oauth2 token error') ||
    responseText.includes('error=oauth2 token error')
  );
}

function parseOauthCallbackResult(responseText: string, fallbackState = '') {
  const json = JSON.parse(responseText) as BasicApiResponse;
  const protocolUrl =
    typeof json.content === 'string'
      ? json.content
      : typeof json.msg === 'string'
        ? json.msg
        : json.desc || '';
  const authMatch = protocolUrl.match(/Authorization=([^&]+)/i);
  const token = authMatch?.[1] ? decodeURIComponent(authMatch[1]) : '';
  const usedState = protocolUrl.match(/[?&]state=([^&]+)/i)?.[1] || fallbackState;

  return {
    token,
    responseText,
    protocolUrl,
    usedState,
  };
}

async function exchangeOauthCallback(parsedUrl: URL) {
  const response = await requestApi(
    `/user/oauth2/callback.jhtml${parsedUrl.search}`,
    {},
    { raw: true, method: 'GET', withoutAuth: true },
  );
  const responseText = await response.text();
  console.log('[DEBUG] callback.jhtml response:', responseText);

  return parseOauthCallbackResult(responseText, parsedUrl.searchParams.get('state')?.trim() || '');
}

async function retryCallbackWithFreshState(originalCallbackUrl: URL) {
  const freshLoginUrl = await fetchLoginUrl();
  await rememberOauthContext(freshLoginUrl);
  const freshState = extractStateFromUrl(freshLoginUrl);
  if (!freshState) {
    return null;
  }

  const retryUrl = new URL(originalCallbackUrl.toString());
  retryUrl.searchParams.set('state', freshState);
  return exchangeOauthCallback(retryUrl);
}

async function exchangeOauthCallbackViaTipsPage(callbackUrl: URL) {
  const tipsResponse = await fetch('https://lsa.lenovo.com/Tips/lmsa/tips/getOauth2Url.jhtml', {
    method: 'GET',
    headers: {
      accept: 'application/json, text/plain, */*',
      'Cache-Control': 'no-cache',
    },
  });
  const tipsResponseText = await tipsResponse.text();
  const tipsJson = JSON.parse(tipsResponseText) as BasicApiResponse;
  const callbackBaseUrl =
    typeof tipsJson.msg === 'string'
      ? tipsJson.msg
      : typeof tipsJson.content === 'string'
        ? tipsJson.content
        : '';

  if (!callbackBaseUrl) {
    throw new Error(`Tips callback URL not found. Server said: ${tipsResponseText}`);
  }

  const browserCallbackUrl = new URL(callbackBaseUrl);
  for (const [key, value] of callbackUrl.searchParams.entries()) {
    browserCallbackUrl.searchParams.set(key, value);
  }

  const callbackResponse = await fetch(browserCallbackUrl.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json, text/plain, */*',
      'Cache-Control': 'no-cache',
    },
  });
  const callbackResponseText = await callbackResponse.text();
  console.log('[DEBUG] tips callback response:', callbackResponseText);
  return parseOauthCallbackResult(
    callbackResponseText,
    callbackUrl.searchParams.get('state')?.trim() || '',
  );
}

function extractLoginUrl(tipData: BasicApiResponse) {
  if (typeof tipData.content !== 'string') return '';

  if (tipData.content.startsWith('http')) {
    return tipData.content;
  }

  try {
    const parsed = JSON.parse(tipData.content) as JsonValue;
    const record = toJsonObject(parsed);
    if (typeof record?.login_url === 'string') return record.login_url;
  } catch {
    // ignore
  }
  return '';
}

function normalizeLenovoLang() {
  const fallback = 'en_US';
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale?.trim();
    if (!locale) return fallback;
    return locale.replaceAll('-', '_');
  } catch {
    return fallback;
  }
}

function withLenovoLang(loginUrl: string) {
  try {
    const parsed = new URL(loginUrl);
    const currentLang = parsed.searchParams.get('lenovoid.lang')?.trim();
    if (!currentLang) {
      parsed.searchParams.set('lenovoid.lang', normalizeLenovoLang());
    }
    return parsed.toString();
  } catch {
    const separator = loginUrl.includes('?') ? '&' : '?';
    return `${loginUrl}${separator}lenovoid.lang=${encodeURIComponent(normalizeLenovoLang())}`;
  }
}

function cleanupAuthUrlCandidate(urlValue: string) {
  return urlValue
    .replaceAll('&amp;', '&')
    .replaceAll(/\s+/g, '')
    .replaceAll(/[\])>,.;]+$/g, '');
}

function extractAuthInputCandidate(rawValue: string) {
  const cleanedRawValue = rawValue.replaceAll(/\u200b/g, '').trim();
  if (!cleanedRawValue) return '';

  const directAuthorizationMatch = cleanedRawValue.match(/Authorization=([^&\s"'<>]+)/i);
  if (directAuthorizationMatch?.[1]) {
    return `Authorization=${directAuthorizationMatch[1]}`;
  }

  const specificUrlPatterns = [
    /softwarefix:\/\/callback[^\s"'<>)]*/i,
    /https:\/\/lsa\.lenovo\.com\/Tips\/lenovoIdSuccess\.html[^\s"'<>)]*/i,
  ];
  for (const pattern of specificUrlPatterns) {
    const matchedValue = cleanedRawValue.match(pattern)?.[0];
    if (matchedValue) {
      return cleanupAuthUrlCandidate(matchedValue);
    }
  }

  const genericCodeAndStateUrl = cleanedRawValue.match(/https?:\/\/[^\s"'<>)]*/gi) || [];
  for (const candidateUrl of genericCodeAndStateUrl) {
    if (candidateUrl.includes('code=') && candidateUrl.includes('state=')) {
      return cleanupAuthUrlCandidate(candidateUrl);
    }
  }

  if (cleanedRawValue.includes('code=') && cleanedRawValue.includes('state=')) {
    return cleanupAuthUrlCandidate(cleanedRawValue);
  }

  return cleanedRawValue;
}

export async function extractAuthToken(urlOrToken: string): Promise<string> {
  const trimmedValue = extractAuthInputCandidate(urlOrToken);
  if (!trimmedValue) return '';
  const sanitizedValue = trimmedValue.includes('code=')
    ? trimmedValue.replaceAll(/\s+/g, '')
    : trimmedValue;

  if (sanitizedValue.includes('code=') && sanitizedValue.includes('state=')) {
    try {
      await loadPendingOauthContextsFromConfig();
      const parsedUrl = new URL(sanitizedValue);
      const isLenovoTipsSuccessUrl =
        parsedUrl.hostname === 'lsa.lenovo.com' &&
        parsedUrl.pathname.toLowerCase() === '/tips/lenovoidsuccess.html';
      const callbackState = parsedUrl.searchParams.get('state')?.trim() || '';

      if (isLenovoTipsSuccessUrl) {
        const tipsCallbackResult = await exchangeOauthCallbackViaTipsPage(parsedUrl);
        if (tipsCallbackResult.token) {
          await removeOauthContext(tipsCallbackResult.usedState || callbackState);
          return tipsCallbackResult.token;
        }
      }

      if (callbackState) {
        restoreOauthContext(callbackState);
      }
      console.log(`[DEBUG] Attempting OAuth exchange with cookies:`, Array.from(cookieJar.keys()));

      const initialCallbackResult = await exchangeOauthCallback(parsedUrl);
      let callbackResult = initialCallbackResult;
      if (initialCallbackResult.token) {
        await removeOauthContext(callbackResult.usedState || callbackState);
        return callbackResult.token;
      }

      if (isOauthStateNotFound(callbackResult.protocolUrl, callbackResult.responseText)) {
        for (const [storedState, pendingContext] of pendingOauthContexts.entries()) {
          if (storedState === callbackState || isContextExpired(pendingContext.createdAtMs)) {
            continue;
          }

          applyPendingOauthContext(pendingContext);
          callbackResult = await exchangeOauthCallback(parsedUrl);
          if (callbackResult.token) {
            await removeOauthContext(storedState);
            return callbackResult.token;
          }

          if (!isOauthStateNotFound(callbackResult.protocolUrl, callbackResult.responseText)) {
            break;
          }
        }
      }

      if (isOauthStateNotFound(callbackResult.protocolUrl, callbackResult.responseText)) {
        const recoveredResult = await retryCallbackWithFreshState(parsedUrl);
        if (recoveredResult?.token) {
          await removeOauthContext(recoveredResult.usedState);
          return recoveredResult.token;
        }
        if (recoveredResult) {
          callbackResult = recoveredResult;
        }
      }

      if (isOauthStateNotFound(callbackResult.protocolUrl, callbackResult.responseText)) {
        await bootstrapSessionCookie();
        const recoveredResultAfterBootstrap = await retryCallbackWithFreshState(parsedUrl);
        if (recoveredResultAfterBootstrap?.token) {
          await removeOauthContext(recoveredResultAfterBootstrap.usedState);
          return recoveredResultAfterBootstrap.token;
        }
        if (recoveredResultAfterBootstrap) {
          callbackResult = recoveredResultAfterBootstrap;
        }
      }

      if (isOauthStateNotFound(callbackResult.protocolUrl, callbackResult.responseText)) {
        throw new Error(
          'OAuth state was not found. Click "Open Lenovo Login" again and use the new callback URL.',
        );
      }
      if (
        isOauthTokenError(initialCallbackResult.protocolUrl, initialCallbackResult.responseText)
      ) {
        throw new Error(
          'OAuth code is already consumed or invalid. Paste the final softwareFix://callback URL (or Authorization token) instead of the https://lsa.lenovo.com/Tips/... URL, then try again with a fresh login.',
        );
      }
      throw new Error(`Token not found in response. Server said: ${callbackResult.responseText}`);
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`OAuth exchange failed: ${errMessage}`);
    }
  }

  const directMatch = sanitizedValue.match(/Authorization=([^&]+)/i);
  if (directMatch?.[1]) {
    return decodeURIComponent(directMatch[1]);
  }

  return sanitizedValue;
}

async function fetchLoginUrl() {
  const tipResponse = await requestApi(
    '/dictionary/getApiInfo.jhtml',
    {
      key: 'TIP_URL',
    },
    { withoutAuth: true },
  );
  const tipData = (await tipResponse.json()) as BasicApiResponse;
  const loginUrl = extractLoginUrl(tipData);

  if (!loginUrl) {
    throw new Error('Could not get login_url from TIP_URL response');
  }

  return withLenovoLang(loginUrl);
}

export async function openLoginBrowser(urlOpener: (url: string) => Promise<void>) {
  const loginUrl = await fetchLoginUrl();
  await rememberOauthContext(loginUrl);
  await urlOpener(loginUrl);
  return loginUrl;
}

export async function authenticateWithAuthToken(config: AppConfig, authToken: string) {
  session.jwt = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;

  const loginResponse = await requestApi(
    '/user/getSFUserInfo.jhtml',
    {},
    { raw: true, method: 'GET' },
  );
  const loginData = (await loginResponse.json()) as BasicApiResponse;
  const code = typeof loginData.code === 'string' ? loginData.code : '';
  const description = typeof loginData.desc === 'string' ? loginData.desc : '';

  if (code !== '0000') {
    return {
      ok: false,
      code,
      description,
    };
  }

  config.authorizationToken = session.jwt;
  await saveConfig(config);

  await requestApi('/common/rsa.jhtml', {}, { raw: true });
  await requestApi('/client/initToken.jhtml', {});

  return {
    ok: true,
    code,
    description,
  };
}
