import {
  authenticateWithAuthToken,
  createLoginUrl,
  extractAuthToken,
} from '../../../../../core/features/auth/login.ts';
import { loadConfig } from '../../../../../core/infra/config.ts';
import { bootstrapSessionCookie } from '../../../../../core/infra/lmsa/api.ts';
import { openExternalUrl } from '../../../browser.ts';
import type { BunRpcRequestHandlers } from '../../../rpc/request-handler-types.ts';
import { toErrorMessage } from '../../../rpc/request-handler-types.ts';
import { openAuthLoginWindow } from '../embedded-auth-window.ts';
import { consumeStartupAuthCallbackUrl } from '../startup-auth-callback.ts';

export interface AuthHandlerOptions {
  getMainWindow?: () => {
    renderer?: 'native' | 'cef';
    maximize?: () => void;
    focus?: () => void;
    webview?: {
      on: (eventName: string, callback: (event?: unknown) => void) => void;
      loadURL: (url: string) => void;
    };
  } | null;
  getMainWindowUrl?: () => string;
}

export function createAuthHandlers(
  options: AuthHandlerOptions = {},
): Pick<
  BunRpcRequestHandlers,
  | 'openUrl'
  | 'authStart'
  | 'authStartInApp'
  | 'authComplete'
  | 'consumePendingAuthCallback'
  | 'getStoredAuthState'
  | 'authWithStoredToken'
  | 'ping'
> {
  const bringMainWindowToFront = () => {
    const mainWindow = options.getMainWindow?.();
    if (!mainWindow) return;
    mainWindow.maximize?.();
    mainWindow.focus?.();
  };

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
        const loginUrl = await createLoginUrl();
        try {
          await openExternalUrl(loginUrl);
          return { ok: true, loginUrl, openedInExternalBrowser: true };
        } catch (error) {
          return {
            ok: true,
            loginUrl,
            openedInExternalBrowser: false,
            error: toErrorMessage(error),
          };
        }
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    authStartInApp: async () => {
      try {
        await bootstrapSessionCookie();
        const loginUrl = await createLoginUrl();
        openAuthLoginWindow(loginUrl, options.getMainWindow?.() ?? undefined);
        return { ok: true, loginUrl, openedInExternalBrowser: false };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    authComplete: async ({ callbackUrlOrToken }) => {
      try {
        const authorizationToken = await extractAuthToken(callbackUrlOrToken || '');
        if (!authorizationToken) {
          return { ok: false, error: 'Missing browser login callback.' };
        }

        const config = await loadConfig();
        const authResult = await authenticateWithAuthToken(config, authorizationToken);
        if (!authResult.ok) {
          return {
            ok: false,
            code: authResult.code,
            error: authResult.description || 'Verification failed.',
          };
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    consumePendingAuthCallback: async () => {
      try {
        const callbackUrlOrToken = consumeStartupAuthCallbackUrl();
        if (callbackUrlOrToken) {
          bringMainWindowToFront();
        }
        return {
          ok: true,
          callbackUrlOrToken: callbackUrlOrToken || undefined,
        };
      } catch (error) {
        return {
          ok: false,
          error: toErrorMessage(error),
        };
      }
    },
    getStoredAuthState: async () => {
      try {
        const config = await loadConfig();
        return {
          ok: true,
          hasStoredAuthorizationToken: Boolean(config.authorizationToken?.trim()),
        };
      } catch (error) {
        return {
          ok: false,
          hasStoredAuthorizationToken: false,
          error: toErrorMessage(error),
        };
      }
    },
    authWithStoredToken: async () => {
      try {
        const config = await loadConfig();
        const storedToken = config.authorizationToken?.trim() || '';
        if (!storedToken) {
          return {
            ok: false,
            error: 'No stored authorization token found in data/config.json.',
          };
        }

        const authResult = await authenticateWithAuthToken(config, storedToken);
        if (!authResult.ok) {
          return {
            ok: false,
            code: authResult.code,
            description: authResult.description,
            error: 'Stored authorization token rejected or expired.',
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
