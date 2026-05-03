import { BrowserWindow } from 'electrobun/bun';
import {
  buildDashboardButtonScript,
  DASHBOARD_NAVIGATION_URL,
} from './embedded-auth-dashboard-button.ts';
import { queueRuntimeAuthCallbackUrl } from './startup-auth-callback.ts';

const SOFTWARE_FIX_CALLBACK_PREFIX = /^softwarefix:\/\/callback/i;

type MainWindowHost = {
  renderer?: 'native' | 'cef';
  focus?: () => unknown;
  maximize?: () => unknown;
};

type AuthWindowHost = {
  close?: () => unknown;
  focus?: () => unknown;
  maximize?: () => void;
  on?: (eventName: string, callback: (event?: unknown) => void) => void;
  webview?: {
    on: (eventName: string, callback: (event?: unknown) => void) => void;
    loadURL?: (url: string) => void;
    executeJavascript?: (js: string) => void;
  };
};

let authWindow: AuthWindowHost | null = null;
let authMainWindow: MainWindowHost | null = null;
let authNavigationActive = false;

function readNavigationUrl(event: unknown) {
  if (typeof event === 'string') {
    return event.trim();
  }

  if (!event || typeof event !== 'object') {
    return '';
  }

  const eventRecord = event as {
    data?: {
      detail?: unknown;
    };
    detail?: unknown;
    url?: unknown;
  };
  const dataDetail = eventRecord.data?.detail;
  if (typeof dataDetail === 'string') {
    return dataDetail.trim();
  }
  if (
    dataDetail &&
    typeof dataDetail === 'object' &&
    typeof (dataDetail as { url?: unknown }).url === 'string'
  ) {
    return (dataDetail as { url: string }).url.trim();
  }
  if (typeof eventRecord.detail === 'string') {
    return eventRecord.detail.trim();
  }
  if (
    eventRecord.detail &&
    typeof eventRecord.detail === 'object' &&
    typeof (eventRecord.detail as { url?: unknown }).url === 'string'
  ) {
    return (eventRecord.detail as { url: string }).url.trim();
  }
  if (typeof eventRecord.url === 'string') {
    return eventRecord.url.trim();
  }

  return '';
}

function isLenovoTipsSuccessUrl(urlValue: string) {
  try {
    const parsed = new URL(urlValue);
    return (
      parsed.hostname === 'lsa.lenovo.com' &&
      parsed.pathname.toLowerCase() === '/tips/lenovoidsuccess.html' &&
      parsed.searchParams.has('code') &&
      parsed.searchParams.has('state')
    );
  } catch {
    return false;
  }
}

function isAuthCompletionUrl(urlValue: string) {
  return SOFTWARE_FIX_CALLBACK_PREFIX.test(urlValue) || isLenovoTipsSuccessUrl(urlValue);
}

function isDashboardNavigationUrl(urlValue: string) {
  return urlValue.trim().toLowerCase() === DASHBOARD_NAVIGATION_URL;
}

function closeAuthWindow(reason: string, focusDashboard: boolean) {
  const activeWindow = authWindow;
  const mainWindow = authMainWindow;
  authWindow = null;
  authMainWindow = null;
  authNavigationActive = false;

  if (activeWindow?.close) {
    try {
      activeWindow.close();
    } catch (error) {
      console.warn(`[AuthWindow] Failed to close auth window (${reason}).`, error);
    }
  }

  if (focusDashboard) {
    try {
      mainWindow?.maximize?.();
      mainWindow?.focus?.();
    } catch (error) {
      console.warn('[AuthWindow] Failed to focus dashboard window.', error);
    }
  }
}

function injectDashboardButton() {
  if (!authNavigationActive || !authWindow?.webview?.executeJavascript) {
    return;
  }

  try {
    authWindow.webview.executeJavascript(buildDashboardButtonScript());
  } catch (error) {
    console.warn('[AuthWindow] Failed to inject dashboard button.', error);
  }
}

function scheduleDashboardButtonInjection() {
  injectDashboardButton();
  setTimeout(injectDashboardButton, 300);
  setTimeout(injectDashboardButton, 1000);
}

function handleNavigationEvent(event?: unknown) {
  if (!authNavigationActive || !authWindow?.webview) {
    return;
  }

  const navigatedUrl = readNavigationUrl(event);
  if (!navigatedUrl) {
    scheduleDashboardButtonInjection();
    return;
  }

  if (isDashboardNavigationUrl(navigatedUrl)) {
    closeAuthWindow('dashboard', true);
    return;
  }

  if (!isAuthCompletionUrl(navigatedUrl)) {
    scheduleDashboardButtonInjection();
    return;
  }

  if (!queueRuntimeAuthCallbackUrl(navigatedUrl)) {
    return;
  }

  closeAuthWindow('callback', true);
}

function isTrustedAuthPopupUrl(urlValue: string) {
  try {
    const parsed = new URL(urlValue);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return (
      parsed.hostname === 'passport-glb.lenovo.com' ||
      parsed.hostname === 'passport.lenovo.com' ||
      parsed.hostname === 'lsa.lenovo.com' ||
      parsed.hostname === 'www.google.com'
    );
  } catch {
    return false;
  }
}

function handleNewWindowOpenEvent(event?: unknown) {
  if (!authNavigationActive || !authWindow?.webview?.loadURL) {
    return;
  }

  const popupUrl = readNavigationUrl(event);
  if (!popupUrl) {
    return;
  }

  if (isDashboardNavigationUrl(popupUrl)) {
    closeAuthWindow('dashboard-popup', true);
    return;
  }

  if (!isTrustedAuthPopupUrl(popupUrl)) return;

  // Lenovo login may open continuation URLs in a new window/tab. Keep the flow in-window.
  authWindow.webview.loadURL(popupUrl);
}

function attachAuthNavigationListeners(windowHost: AuthWindowHost) {
  if (!windowHost.webview || typeof windowHost.webview.on !== 'function') {
    throw new Error('Auth window webview is not available.');
  }

  windowHost.webview.on('will-navigate', handleNavigationEvent);
  windowHost.webview.on('did-commit-navigation', handleNavigationEvent);
  windowHost.webview.on('did-navigate', handleNavigationEvent);
  windowHost.webview.on('dom-ready', () => scheduleDashboardButtonInjection());
  windowHost.webview.on('new-window-open', handleNewWindowOpenEvent);
}

function closeExistingAuthWindow(reason: string) {
  if (!authWindow?.close) {
    return;
  }

  closeAuthWindow(reason, false);
}

export function openAuthLoginWindow(loginUrl: string, mainWindow?: MainWindowHost) {
  closeExistingAuthWindow('reopen');
  authMainWindow = mainWindow ?? null;

  const defaultRenderer = mainWindow?.renderer === 'native' ? 'native' : 'cef';
  const requestedAuthRenderer = (Bun.env.LE_MOTO_AUTH_RENDERER || '').toLowerCase();
  const preferredRenderer: 'native' | 'cef' =
    requestedAuthRenderer === 'native' || requestedAuthRenderer === 'cef'
      ? requestedAuthRenderer
      : process.platform === 'linux'
        ? 'cef'
        : defaultRenderer;

  const createWindow = (renderer: 'native' | 'cef') =>
    new BrowserWindow({
      title: 'Lenovo Login',
      url: loginUrl,
      renderer,
      sandbox: true,
      frame: {
        width: 1280,
        height: 900,
        x: 80,
        y: 40,
      },
    });

  let createdWindow: BrowserWindow;
  try {
    console.log(`[AuthWindow] Opening login window with renderer: ${preferredRenderer}`);
    createdWindow = createWindow(preferredRenderer);
  } catch (error) {
    if (preferredRenderer === defaultRenderer) {
      throw error;
    }
    console.warn(
      `[AuthWindow] Preferred renderer '${preferredRenderer}' failed, falling back to '${defaultRenderer}'.`,
      error,
    );
    createdWindow = createWindow(defaultRenderer);
  }

  if (!createdWindow.webview || typeof createdWindow.webview.on !== 'function') {
    throw new Error('Auth window webview is not available.');
  }

  authWindow = createdWindow;
  authNavigationActive = true;
  attachAuthNavigationListeners(createdWindow);
  if (typeof createdWindow.on === 'function') {
    createdWindow.on('close', () => {
      if (authWindow === createdWindow) {
        authWindow = null;
        authMainWindow = null;
        authNavigationActive = false;
      }
    });
  }
  if (typeof createdWindow.maximize === 'function') {
    createdWindow.maximize();
  }
  createdWindow.focus?.();
  scheduleDashboardButtonInjection();
}
