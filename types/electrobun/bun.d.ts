export type DefineRpcHandlers = {
  requests: Record<string, any>;
  messages: Record<string, any>;
};

export type DefinedRpc = {
  request: Record<string, (payload?: any) => Promise<any>>;
  send: (message: string, payload?: any) => void;
};

export declare class BrowserView {
  constructor(options: any);
  id: number;
  on(eventName: string, callback: (event?: unknown) => void): void;
  remove(): void;
  loadURL(url: string): void;
  static defineRPC<TSchema>(options: {
    maxRequestTime?: number;
    handlers: DefineRpcHandlers;
  }): DefinedRpc;
}

export declare class BrowserWindow {
  constructor(options: any);
  id: number;
  renderer: "native" | "cef";
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  webview: {
    on(eventName: string, callback: (event?: unknown) => void): void;
    loadURL(url: string): void;
  };
  close(): unknown;
  focus(): unknown;
  setSize(width: number, height: number): unknown;
  getFrame(): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  maximize(): void;
  on(eventName: string, callback: (event?: unknown) => void): void;
  ptr?: any;
}

export declare const BuildConfig: {
  get(): Promise<{
    availableRenderers?: string[];
    defaultRenderer: "native" | "cef";
  }>;
};

export declare const Utils: {
  paths: {
    userCache: string;
  };
  showNotification(options: {
    title: string;
    body?: string;
    subtitle?: string;
    silent?: boolean;
  }): void;
};

export declare const Updater: {
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
