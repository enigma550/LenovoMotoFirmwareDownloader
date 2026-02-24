import { requestApi } from "../../infra/lmsa/api.ts";
import type { AppConfig } from "../../shared/types/index.ts";
import { saveConfig } from "../../infra/config.ts";
import { session } from "../../infra/lmsa/state.ts";
import { join } from "path";
import { openExternalUrl } from "../../../runtime/bun/browser";
import { loadConfig } from "../../infra/config";

interface BasicApiResponse {
  code?: string;
  desc?: string;
  content?: unknown;
}


function extractLoginUrl(tipData: BasicApiResponse) {
  if (typeof tipData.content !== "string") return "";

  try {
    const parsed = JSON.parse(tipData.content);
    if (typeof parsed?.login_url === "string") return parsed.login_url;
  } catch {
    // ignore
  }
  return "";
}

export function extractWustToken(urlOrToken: string) {
  const trimmedValue = urlOrToken.trim();
  if (!trimmedValue) return "";

  const match = trimmedValue.match(/lenovoid\.wust=([^&]+)/i);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  return trimmedValue;
}

async function fetchLoginUrl() {
  const tipResponse = await requestApi("/dictionary/getApiInfo.jhtml", {
    key: "TIP_URL",
  });
  const tipData = (await tipResponse.json()) as BasicApiResponse;
  const loginUrl = extractLoginUrl(tipData);

  if (!loginUrl) {
    throw new Error("Could not get login_url from TIP_URL response");
  }

  return loginUrl;
}

export async function openLoginBrowser() {
  const loginUrl = await fetchLoginUrl();
  await openExternalUrl(loginUrl);
  return loginUrl;
}

export async function authenticateWithWustToken(
  config: AppConfig,
  wustToken: string,
) {
  const loginResponse = await requestApi("/user/lenovoIdLogin.jhtml", {
    wust: wustToken,
    guid: session.guid,
  });
  const loginData = (await loginResponse.json()) as BasicApiResponse;
  const code = typeof loginData.code === "string" ? loginData.code : "";
  const description = typeof loginData.desc === "string" ? loginData.desc : "";

  if (code !== "0000") {
    return {
      ok: false,
      code,
      description,
    };
  }

  config.wustToken = wustToken;
  await saveConfig(config);
  await requestApi("/common/rsa.jhtml", {}, { raw: true });
  await requestApi("/client/initToken.jhtml", {});

  return {
    ok: true,
    code,
    description,
  };
}
