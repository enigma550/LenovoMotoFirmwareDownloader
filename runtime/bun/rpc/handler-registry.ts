type HandlerKey<Handlers extends object> = Extract<keyof Handlers, string>;

export class RpcHandlerRegistry<Handlers extends object> {
  private readonly handlers = new Map<HandlerKey<Handlers>, Handlers[HandlerKey<Handlers>]>();

  registerMany<Subset extends Partial<Handlers>>(handlers: Subset) {
    for (const method of Object.keys(handlers) as Array<HandlerKey<Subset>>) {
      if (this.handlers.has(method as HandlerKey<Handlers>)) {
        throw new Error(`RPC handler already registered: ${method}`);
      }

      const handler = handlers[method];
      if (handler === undefined) {
        continue;
      }

      this.handlers.set(method as HandlerKey<Handlers>, handler as Handlers[HandlerKey<Handlers>]);
    }
  }

  toRecord(): Handlers {
    return Object.fromEntries(this.handlers.entries()) as Handlers;
  }
}
