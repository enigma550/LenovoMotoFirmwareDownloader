export type DefineRpcHandlers = {
  requests: Record<string, any>;
  messages: Record<string, any>;
};

export type DefinedRpc = {
  request: Record<string, (payload?: any) => Promise<any>>;
  send: (message: string, payload?: any) => void;
};

export class Electroview {
  constructor(options: any);
  static defineRPC<TSchema>(options: {
    maxRequestTime?: number;
    handlers: DefineRpcHandlers;
  }): DefinedRpc;
}
