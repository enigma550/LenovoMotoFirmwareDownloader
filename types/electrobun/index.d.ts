export type RPCSchema<
  T extends { requests?: Record<string, any>; messages?: Record<string, any> },
> = T;

export type ElectrobunRPCSchema = {
  bun?: any;
  webview?: any;
};
