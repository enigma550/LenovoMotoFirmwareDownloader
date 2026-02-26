export type DefineRpcHandlers = {
  requests: Record<string, unknown>;
  messages: Record<string, unknown>;
};

export type DefinedRpc = {
  request: Record<string, (payload?: unknown) => Promise<unknown>>;
  send: (message: string, payload?: unknown) => void;
};

export class Electroview {
  constructor(options: unknown);
  static defineRPC<TSchema>(options: { maxRequestTime?: number; handlers: DefineRpcHandlers }): DefinedRpc;
}
