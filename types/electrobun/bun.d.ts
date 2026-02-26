export type DefineRpcHandlers = {
  requests: Record<string, any>;
  messages: Record<string, any>;
};

export type DefinedRpc = {
  request: Record<string, (payload?: any) => Promise<any>>;
  send: (message: string, payload?: any) => void;
};

export const BrowserView: {
  defineRPC<TSchema>(options: {
    maxRequestTime?: number;
    handlers: DefineRpcHandlers;
  }): DefinedRpc;
};

export class BrowserWindow {
  constructor(options: any);
  webview: {
    on(eventName: string, callback: () => void): void;
  };
  maximize(): void;
  ptr?: any;
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
      details?: any;
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
  getLocallocalInfo(): Promise<any>;
  appDataFolder(): Promise<string>;
};
