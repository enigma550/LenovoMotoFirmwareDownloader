export type DefineRpcHandlers = {
  requests: Record<string, unknown>;
  messages: Record<string, unknown>;
};

export type DefinedRpc = {
  request: Record<string, (payload?: unknown) => Promise<unknown>>;
  send: (message: string, payload?: unknown) => void;
};

export const BrowserView: {
  defineRPC<TSchema>(options: {
    maxRequestTime?: number;
    handlers: DefineRpcHandlers;
  }): DefinedRpc;
};

export class BrowserWindow {
  constructor(options: unknown);
  webview: {
    on(eventName: string, callback: () => void): void;
  };
  maximize(): void;
  ptr?: unknown;
}

export const BuildConfig: {
  get(): Promise<{
    availableRenderers?: string[];
    defaultRenderer: "native" | "cef";
  }>;
};

export const Utils: {
  paths: {
    userCache: string;
  };
};

export const Updater: {
  onStatusChange(
    callback: (entry: {
      status: string;
      message: string;
      details?: unknown;
    }) => void,
  ): void;
  checkForUpdate(): Promise<{
    version: string;
    hash: string;
    updateAvailable: boolean;
    updateReady: boolean;
    error: string;
  }>;
  downloadUpdate(): Promise<void>;
  getLocallocalInfo(): Promise<unknown>;
  appDataFolder(): Promise<string>;
};
