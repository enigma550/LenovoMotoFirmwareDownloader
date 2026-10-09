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

      // Normalize `null` params (malformed renderer payloads) to undefined so
      // destructuring handlers fail gracefully instead of throwing TypeErrors.
      const guardedHandler = ((params?: unknown) =>
        (handler as (value?: unknown) => unknown)(
          params === null ? undefined : params,
        )) as Handlers[HandlerKey<Handlers>];

      this.handlers.set(method as HandlerKey<Handlers>, guardedHandler);
    }
  }

  toRecord(): Handlers {
    return Object.fromEntries(this.handlers.entries()) as Handlers;
  }
}
