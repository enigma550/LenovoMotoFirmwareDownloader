export type RPCSchema<T extends { requests?: Record<string, unknown>; messages?: Record<string, unknown> }> = T;

export type ElectrobunRPCSchema = {
  bun?: unknown;
  webview?: unknown;
};
