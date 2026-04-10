import { BrowserWindow } from 'electrobun/bun';
import { queueRuntimeAuthCallbackUrl } from './startup-auth-callback.ts';

const SOFTWARE_FIX_CALLBACK_PREFIX = /^softwarefix:\/\/callback/i;

type MainWindowHost = {
  renderer?: 'native' | 'cef';
};

type AuthWindowHost = {
  close?: () => unknown;
  focus?: () => unknown;
  maximize?: () => void;
  on?: (eventName: string, callback: (event?: unknown) => void) => void;
  webview?: {
    on: (eventName: string, callback: (event?: unknown) => void) => void;
    loadURL?: (url: string) => void;
  };
};

let authWindow: AuthWindowHost | null = null;
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

function handleNavigationEvent(event?: unknown) {
  if (!authNavigationActive || !authWindow?.webview) {
    return;
  }

  const navigatedUrl = readNavigationUrl(event);
  if (!navigatedUrl || !isAuthCompletionUrl(navigatedUrl)) {
    return;
  }

  if (!queueRuntimeAuthCallbackUrl(navigatedUrl)) {
    return;
  }

  authNavigationActive = false;
  const activeWindow = authWindow;
  authWindow = null;
  if (activeWindow?.close) {
    try {
      activeWindow.close();
    } catch (error) {
      console.warn('[AuthWindow] Failed to close auth window after callback.', error);
    }
  }
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
  if (!popupUrl || !isTrustedAuthPopupUrl(popupUrl)) {
    return;
  }

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
  windowHost.webview.on('new-window-open', handleNewWindowOpenEvent);
}

function closeExistingAuthWindow(reason: string) {
  const closeWindow = authWindow?.close;
  if (!closeWindow) {
    return;
  }

  authWindow = null;
  authNavigationActive = false;
  try {
    closeWindow();
  } catch (error) {
    console.warn(`[AuthWindow] Failed to close existing auth window (${reason}).`, error);
  }
}

export function openAuthLoginWindow(
  loginUrl: string,
  mainWindow?: MainWindowHost,
  _restoreUrl = 'views://mainview/browser/index.html',
) {
  closeExistingAuthWindow('reopen');

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
        authNavigationActive = false;
      }
    });
  }
  if (typeof createdWindow.maximize === 'function') {
    createdWindow.maximize();
  }
  createdWindow.focus?.();
}
