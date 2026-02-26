import { saveConfig } from '../../infra/config.ts';
import { requestApi } from '../../infra/lmsa/api.ts';
import { session } from '../../infra/lmsa/state.ts';
import type { AppConfig, JsonObject, JsonValue } from '../../shared/types/index.ts';

interface BasicApiResponse {
  code?: string;
  desc?: string;
  content?: JsonValue;
}

function toJsonObject(value: JsonValue | null | undefined): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function extractLoginUrl(tipData: BasicApiResponse) {
  if (typeof tipData.content !== 'string') return '';

  try {
    const parsed = JSON.parse(tipData.content) as JsonValue;
    const record = toJsonObject(parsed);
    if (typeof record?.login_url === 'string') return record.login_url;
  } catch {
    // ignore
  }
  return '';
}

export function extractWustToken(urlOrToken: string) {
  const trimmedValue = urlOrToken.trim();
  if (!trimmedValue) return '';

  const match = trimmedValue.match(/lenovoid\.wust=([^&]+)/i);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  return trimmedValue;
}

async function fetchLoginUrl() {
  const tipResponse = await requestApi('/dictionary/getApiInfo.jhtml', {
    key: 'TIP_URL',
  });
  const tipData = (await tipResponse.json()) as BasicApiResponse;
  const loginUrl = extractLoginUrl(tipData);

  if (!loginUrl) {
    throw new Error('Could not get login_url from TIP_URL response');
  }

  return loginUrl;
}

export async function openLoginBrowser(urlOpener: (url: string) => Promise<void>) {
  const loginUrl = await fetchLoginUrl();
  await urlOpener(loginUrl);
  return loginUrl;
}

export async function authenticateWithWustToken(config: AppConfig, wustToken: string) {
  const loginResponse = await requestApi('/user/lenovoIdLogin.jhtml', {
    wust: wustToken,
    guid: session.guid,
  });
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

  config.wustToken = wustToken;
  await saveConfig(config);
  await requestApi('/common/rsa.jhtml', {}, { raw: true });
  await requestApi('/client/initToken.jhtml', {});

  return {
    ok: true,
    code,
    description,
  };
}
