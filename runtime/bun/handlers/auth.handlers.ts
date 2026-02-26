import {
  authenticateWithWustToken,
  extractWustToken,
  openLoginBrowser,
} from '../../../core/features/auth/index.ts';
import { loadConfig } from '../../../core/infra/config.ts';
import { bootstrapSessionCookie } from '../../../core/infra/lmsa/api.ts';
import { openExternalUrl } from '../browser.ts';
import type { BunRpcRequestHandlers } from './types.ts';
import { toErrorMessage } from './types.ts';

export function createAuthHandlers(): Pick<
  BunRpcRequestHandlers,
  'openUrl' | 'authStart' | 'authComplete' | 'getStoredAuthState' | 'authWithStoredToken' | 'ping'
> {
  return {
    openUrl: async ({ url }) => {
      try {
        await openExternalUrl(url);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    authStart: async () => {
      try {
        await bootstrapSessionCookie();
        const loginUrl = await openLoginBrowser(openExternalUrl);
        return { ok: true, loginUrl };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    authComplete: async ({ callbackUrlOrToken }) => {
      const wustToken = extractWustToken(callbackUrlOrToken || '');
      if (!wustToken) {
        return { ok: false, error: 'Missing callback URL or wust token.' };
      }

      const config = await loadConfig();
      const authResult = await authenticateWithWustToken(config, wustToken);
      if (!authResult.ok) {
        return {
          ok: false,
          code: authResult.code,
          description: authResult.description,
          error: 'WUST token rejected or expired.',
        };
      }

      return {
        ok: true,
        code: authResult.code,
        description: authResult.description,
      };
    },
    getStoredAuthState: async () => {
      try {
        const config = await loadConfig();
        return {
          ok: true,
          hasStoredWustToken: Boolean(config.wustToken?.trim()),
        };
      } catch (error) {
        return {
          ok: false,
          hasStoredWustToken: false,
          error: toErrorMessage(error),
        };
      }
    },
    authWithStoredToken: async () => {
      try {
        const config = await loadConfig();
        const storedToken = config.wustToken?.trim() || '';
        if (!storedToken) {
          return {
            ok: false,
            error: 'No stored WUST token found in data/config.json.',
          };
        }

        const authResult = await authenticateWithWustToken(config, storedToken);
        if (!authResult.ok) {
          return {
            ok: false,
            code: authResult.code,
            description: authResult.description,
            error: 'Stored WUST token rejected or expired.',
          };
        }

        return {
          ok: true,
          code: authResult.code,
          description: authResult.description,
        };
      } catch (error) {
        return {
          ok: false,
          error: toErrorMessage(error),
        };
      }
    },
    ping: async () => {
      return {
        ok: true,
        serverTime: Date.now(),
      };
    },
  };
}
