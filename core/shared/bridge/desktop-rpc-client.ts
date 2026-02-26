export type DesktopBridgeWindowGlobals = Window & {
  __electrobunBunBridge?: {
    postMessage: (message: string) => void;
  };
  __electrobun?: {
    receiveMessageFromBun?: (message: unknown) => void;
  };
};

type WebView2HostBunBridge = {
  postMessage?: (message: string) => void;
  [propertyName: string]: unknown;
};

type WebView2Window = Window & {
  chrome?: {
    webview?: {
      hostObjects?: {
        bunBridge?: WebView2HostBunBridge;
      };
    };
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeIncomingRpcPacket(payload: unknown) {
  if (isRecord(payload)) {
    return payload;
  }

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function getWebView2HostBunBridge() {
  const webView2Window = window as WebView2Window;
  return webView2Window.chrome?.webview?.hostObjects?.bunBridge;
}

function getWebView2LegacyPostMessage(hostBridge: WebView2HostBunBridge) {
  const legacyPostMessage = hostBridge['PostMessage'];
  return typeof legacyPostMessage === 'function'
    ? (legacyPostMessage as (message: string) => void)
    : undefined;
}

export function createDesktopRpcClient(options: {
  downloadProgressEventName: string;
  defaultRpcTimeoutMs: number;
  downloadRpcTimeoutMs: number;
}) {
  const { downloadProgressEventName, defaultRpcTimeoutMs, downloadRpcTimeoutMs } = options;
  let requestCounter = 0;
  const pendingRequests = new Map<number, PendingRequest>();

  function dispatchDownloadProgress(payload: unknown) {
    const event = new CustomEvent(downloadProgressEventName, {
      detail: payload,
    });
    window.dispatchEvent(event);
  }

  function getRpcTimeoutMs(method: string) {
    return method === 'downloadFirmware' ||
      method === 'rescueLiteFirmware' ||
      method === 'rescueLiteFirmwareFromLocal' ||
      method === 'extractLocalFirmware'
      ? downloadRpcTimeoutMs
      : defaultRpcTimeoutMs;
  }

  function handleIncomingRpcPacket(payload: unknown) {
    const packet = normalizeIncomingRpcPacket(payload);
    if (!packet || typeof packet['type'] !== 'string') {
      return;
    }

    if (packet['type'] === 'response') {
      const id =
        typeof packet['id'] === 'number' ? packet['id'] : Number.parseInt(String(packet['id']), 10);
      if (!Number.isFinite(id)) {
        return;
      }

      const pending = pendingRequests.get(id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutId);
      pendingRequests.delete(id);

      if (packet['success']) {
        pending.resolve(packet['payload']);
        return;
      }

      const errorMessage =
        typeof packet['error'] === 'string' ? packet['error'] : 'RPC request failed.';
      pending.reject(new Error(errorMessage));
      return;
    }

    if (
      packet['type'] === 'message' &&
      packet['id'] === 'downloadProgress' &&
      'payload' in packet
    ) {
      dispatchDownloadProgress(packet['payload']);
    }
  }

  function hasBunBridge() {
    const globals = window as DesktopBridgeWindowGlobals;
    if (typeof globals.__electrobunBunBridge?.postMessage === 'function') {
      return true;
    }
    // Polyfill for Windows WebView2 if Electrobun native injection failed (host objects)
    const hostObj = getWebView2HostBunBridge();
    const legacyPostMessage = hostObj ? getWebView2LegacyPostMessage(hostObj) : undefined;
    if (hostObj && (typeof hostObj.postMessage === 'function' || Boolean(legacyPostMessage))) {
      return true;
    }
    return false;
  }

  function attachBunBridgeMessageHandler() {
    const globals = window as DesktopBridgeWindowGlobals;

    // Polyfill using hostObjects
    if (!globals.__electrobunBunBridge?.postMessage) {
      const hostObj = getWebView2HostBunBridge();
      if (hostObj) {
        const legacyPostMessage = getWebView2LegacyPostMessage(hostObj);
        globals.__electrobunBunBridge = {
          postMessage: (msg: string) => {
            if (typeof hostObj.postMessage === 'function') hostObj.postMessage(msg);
            else if (legacyPostMessage) legacyPostMessage(msg);
          },
        };
      }
    }

    if (!globals.__electrobunBunBridge?.postMessage) {
      return false;
    }

    const electrobun = ((globals as unknown as Record<string, unknown>)['__electrobun'] || {}) as {
      receiveMessageFromBun?: (payload: unknown) => void;
    };
    electrobun.receiveMessageFromBun = (payload: unknown) => {
      handleIncomingRpcPacket(payload);
    };
    (globals as unknown as Record<string, unknown>)['__electrobun'] = electrobun;

    return true;
  }

  function postRpcRequest(method: string, params?: unknown) {
    let bridge = (window as DesktopBridgeWindowGlobals).__electrobunBunBridge;
    if (!bridge?.postMessage) {
      // Fallback catch if polyfill hasn't run but we need to post
      const hostObj = getWebView2HostBunBridge();
      const legacyPostMessage = hostObj ? getWebView2LegacyPostMessage(hostObj) : undefined;
      if (hostObj && (typeof hostObj.postMessage === 'function' || Boolean(legacyPostMessage))) {
        bridge = {
          postMessage: (msg: string) =>
            hostObj.postMessage ? hostObj.postMessage(msg) : legacyPostMessage?.(msg),
        };
      }
    }
    if (!bridge?.postMessage) {
      return Promise.reject(new Error('Electrobun bun bridge is not available in this webview.'));
    }
    const postMessage = bridge.postMessage;

    const requestId = ++requestCounter;
    return new Promise<unknown>((resolve, reject) => {
      const timeoutMs = getRpcTimeoutMs(method);
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`RPC request timed out: ${method}`));
      }, timeoutMs);

      pendingRequests.set(requestId, { resolve, reject, timeoutId });

      postMessage(
        JSON.stringify({
          type: 'request',
          id: requestId,
          method,
          params,
        }),
      );
    });
  }

  return {
    hasBunBridge,
    attachBunBridgeMessageHandler,
    postRpcRequest,
  };
}
