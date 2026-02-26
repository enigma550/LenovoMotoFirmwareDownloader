import {
  createDesktopApiFromInvoker,
  createDesktopRpcClient,
  type DesktopBridgeWindowGlobals,
  type DesktopRpcInvoker,
} from '../../../../../core/shared/bridge';

let initializationPromise: Promise<boolean> | null = null;
let lastInitializationError = '';
let fallbackInstalled = false;

const BRIDGE_WAIT_ATTEMPTS = 600;
const BRIDGE_WAIT_INTERVAL_MS = 50;
const DOWNLOAD_PROGRESS_EVENT_NAME = 'desktop-download-progress';
const DEFAULT_RPC_TIMEOUT_MS = 120_000;
const DOWNLOAD_RPC_TIMEOUT_MS = 6 * 60 * 60 * 1000;

type BridgeWindowGlobals = DesktopBridgeWindowGlobals & {
  __electrobunWebviewId?: number | string;
};

type WebView2Window = Window & {
  chrome?: {
    webview?: {
      postMessage?: (message: string) => void;
    };
  };
};

function isDesktopViewsRuntime() {
  return window.location.protocol === 'views:';
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

const bunBridgeRpcClient = createDesktopRpcClient({
  downloadProgressEventName: DOWNLOAD_PROGRESS_EVENT_NAME,
  defaultRpcTimeoutMs: DEFAULT_RPC_TIMEOUT_MS,
  downloadRpcTimeoutMs: DOWNLOAD_RPC_TIMEOUT_MS,
});

function getWebView2Bridge() {
  const webView2Window = window as WebView2Window;
  return webView2Window.chrome?.webview;
}

function tryInstallFallbackDesktopApi() {
  if (window.desktopApi?.isDesktop) {
    fallbackInstalled = true;
    return true;
  }

  if (fallbackInstalled) {
    return false;
  }

  if (!bunBridgeRpcClient.hasBunBridge()) {
    // Attempt WebView2 polyfill since native bridge is missing
    const webView2Bridge = getWebView2Bridge();
    if (typeof webView2Bridge?.postMessage === 'function') {
      const globals = window as BridgeWindowGlobals;
      if (!globals.__electrobunWebviewId) {
        globals.__electrobunWebviewId = 1; // Assuming mainview is webview 1
      }
      if (!globals.__electrobunBunBridge) {
        globals.__electrobunBunBridge = {
          postMessage: (message: string) => {
            webView2Bridge.postMessage?.(message);
          },
        };
      }
    }

    if (!bunBridgeRpcClient.hasBunBridge()) {
      return false;
    }
  }

  if (!bunBridgeRpcClient.attachBunBridgeMessageHandler()) {
    return false;
  }

  const desktopApi = createDesktopApiFromInvoker(((method, params) =>
    bunBridgeRpcClient.postRpcRequest(method, params)) as DesktopRpcInvoker);

  window.desktopApi = desktopApi;
  fallbackInstalled = true;
  return true;
}

async function waitForDesktopApiReady() {
  for (let attempt = 0; attempt < BRIDGE_WAIT_ATTEMPTS; attempt += 1) {
    if (window.desktopApi?.isDesktop) {
      return true;
    }

    tryInstallFallbackDesktopApi();

    if (window.desktopApi?.isDesktop) {
      return true;
    }

    await wait(BRIDGE_WAIT_INTERVAL_MS);
  }
  return Boolean(window.desktopApi?.isDesktop);
}

export function ensureDesktopBridgeReady(): Promise<boolean> {
  return ensureDesktopBridgeReadyInternal();
}

export async function reconnectDesktopBridge(): Promise<boolean> {
  resetDesktopBridgeState();
  return ensureDesktopBridgeReadyInternal();
}

async function ensureDesktopBridgeReadyInternal(): Promise<boolean> {
  if (window.desktopApi?.isDesktop) {
    lastInitializationError = '';
    return true;
  }

  if (!isDesktopViewsRuntime()) {
    return false;
  }

  tryInstallFallbackDesktopApi();

  if (!initializationPromise) {
    initializationPromise = waitForDesktopApiReady();
  }

  const ready = await initializationPromise;
  if (!ready) {
    initializationPromise = null;
    const globals = window as BridgeWindowGlobals;
    const webviewId = Number(globals.__electrobunWebviewId);
    const hasBunBridge = Boolean(globals.__electrobunBunBridge?.postMessage);
    lastInitializationError =
      'Desktop bridge did not initialize in views runtime. ' +
      `webviewId=${Number.isFinite(webviewId) ? webviewId : 'N/A'}, ` +
      `bunBridge=${hasBunBridge ? 'yes' : 'no'}.`;
    return false;
  }

  lastInitializationError = '';
  return true;
}

export function getDesktopBridgeError(): string {
  return lastInitializationError;
}

function resetDesktopBridgeState() {
  initializationPromise = null;
  fallbackInstalled = false;
  lastInitializationError = '';
  try {
    delete (window as { desktopApi?: NonNullable<typeof window.desktopApi> }).desktopApi;
  } catch {
    // Ignore reset failures on readonly globals.
  }
}
