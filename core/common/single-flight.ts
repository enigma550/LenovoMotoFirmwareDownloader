/**
 * Single-flight — collapses concurrent calls with the same key into one
 * execution whose result (or error) is shared by all callers. Used to protect
 * session-establishment flows from duplicated check-ins/token exchanges.
 */
export interface SingleFlight<T> {
  run(key: string, task: () => Promise<T>): Promise<T>;
  /** Number of in-flight keys (for tests/diagnostics). */
  inFlight(): number;
}

export function createSingleFlight<T>(): SingleFlight<T> {
  const inFlight = new Map<string, Promise<T>>();

  return {
    inFlight: () => inFlight.size,
    run(key, task) {
      const existing = inFlight.get(key);
      if (existing) {
        return existing;
      }

      const promise = (async () => task())().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
  };
}
