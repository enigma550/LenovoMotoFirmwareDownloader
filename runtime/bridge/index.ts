import type { DesktopRpcSchema } from "../shared/rpc.ts";
import type { DownloadProgressMessage } from "../../core/shared/types/desktop-api.ts";
import {
  createDesktopRpcClient,
  type DesktopBridgeWindowGlobals,
} from "../shared/desktop-rpc-client.ts";
import {
  createDesktopApiFromInvoker,
  type DesktopRpcInvoker,
} from "../shared/desktop-api-mapping.ts";

const DOWNLOAD_PROGRESS_EVENT_NAME = "desktop-download-progress";
const MAX_INIT_ATTEMPTS = 600;
const RETRY_DELAY_MS = 50;
const DEFAULT_RPC_TIMEOUT_MS = 120_000;
const DOWNLOAD_RPC_TIMEOUT_MS = 6 * 60 * 60 * 1000;
let bridgeReady = false;
let bridgeInitializing = false;

type BridgeWindowGlobals = DesktopBridgeWindowGlobals & {
  __electrobunWebviewId?: unknown;
  __electrobunRpcSocketPort?: unknown;
};

function dispatchDownloadProgress(payload: unknown) {
  const event = new CustomEvent<DownloadProgressMessage>(
    DOWNLOAD_PROGRESS_EVENT_NAME,
    { detail: payload as DownloadProgressMessage },
  );
  window.dispatchEvent(event);
}

const bunBridgeRpcClient = createDesktopRpcClient({
  downloadProgressEventName: DOWNLOAD_PROGRESS_EVENT_NAME,
  defaultRpcTimeoutMs: DEFAULT_RPC_TIMEOUT_MS,
  downloadRpcTimeoutMs: DOWNLOAD_RPC_TIMEOUT_MS,
});

function setupDesktopApiViaBunBridge() {
  if (!bunBridgeRpcClient.attachBunBridgeMessageHandler()) {
    throw new Error("Electrobun bun bridge is missing.");
  }

  window.desktopApi = createDesktopApiFromInvoker(((method, params) =>
    bunBridgeRpcClient.postRpcRequest(method, params)) as DesktopRpcInvoker);
}

import { Electroview } from "electrobun/view";

async function setupDesktopApiViaElectroview() {
  const rpc = Electroview.defineRPC<DesktopRpcSchema>({
    maxRequestTime: DOWNLOAD_RPC_TIMEOUT_MS,
    handlers: {
      requests: {},
      messages: {
        downloadProgress: dispatchDownloadProgress,
      },
    },
  });

  new Electroview({ rpc });

  window.desktopApi = createDesktopApiFromInvoker(((method, params) => {
    const request = (
      rpc.request as Record<string, (payload?: unknown) => Promise<unknown>>
    )[String(method)];

    if (typeof request !== "function") {
      return Promise.reject(
        new Error(`Electroview RPC handler is missing: ${String(method)}`),
      );
    }

    return params === undefined ? request() : request(params);
  }) as DesktopRpcInvoker);
}

function hasElectrobunGlobals() {
  const globals = window as BridgeWindowGlobals;
  const webviewId = Number(globals.__electrobunWebviewId);
  return Number.isFinite(webviewId) && webviewId > 0;
}

function initializeDesktopBridge(attempt = 0) {
  if (bridgeReady || bridgeInitializing || window.desktopApi?.isDesktop) {
    bridgeReady = true;
    return;
  }

  try {
    if (!hasElectrobunGlobals()) {
      if (attempt >= MAX_INIT_ATTEMPTS) {
        console.error(
          "[DesktopBridge] Electrobun globals were not ready in time (webviewId).",
        );
        return;
      }
      setTimeout(() => initializeDesktopBridge(attempt + 1), RETRY_DELAY_MS);
      return;
    }

    bridgeInitializing = true;
    const rpcPort = Number(
      (window as BridgeWindowGlobals).__electrobunRpcSocketPort,
    );
    const shouldUseElectroview = Number.isFinite(rpcPort) && rpcPort > 0;

    const setupPromise = bunBridgeRpcClient.hasBunBridge()
      ? Promise.resolve().then(() => setupDesktopApiViaBunBridge())
      : shouldUseElectroview
        ? setupDesktopApiViaElectroview()
        : Promise.reject(
          new Error(
            "Neither bun bridge nor electroview socket transport is available yet.",
          ),
        );

    void setupPromise
      .then(() => {
        bridgeReady = true;
      })
      .catch((error) => {
        if (attempt >= MAX_INIT_ATTEMPTS) {
          console.error("[DesktopBridge] Initialization failed:", error);
          return;
        }
        setTimeout(() => initializeDesktopBridge(attempt + 1), RETRY_DELAY_MS);
      })
      .finally(() => {
        bridgeInitializing = false;
      });
  } catch (error: unknown) {
    if (attempt >= MAX_INIT_ATTEMPTS) {
      console.error("[DesktopBridge] Initialization failed:", error);
      return;
    }
    setTimeout(() => initializeDesktopBridge(attempt + 1), RETRY_DELAY_MS);
  }
}

initializeDesktopBridge();
