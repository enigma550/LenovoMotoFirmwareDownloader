/**
 * Pending OAuth context store — session cookies/identifiers remembered between
 * the browser login redirect and the callback exchange.
 *
 * Extracted from login.ts behind a small dependency port (config persistence +
 * clock) so the TTL/cap/persistence rules are unit-testable and the auth flow
 * no longer depends on global state.
 */

export interface PendingOauthContext {
  cookieEntries: Array<[string, string]>;
  createdAtMs: number;
  guid?: string;
  clientUuid?: string;
}

export interface OauthContextConfigRecord {
  state: string;
  cookieEntries: Array<[string, string]>;
  createdAtMs: number;
  guid?: string;
  clientUuid?: string;
  /** Legacy wrapped shape (`{ state, context: {...} }`) accepted on load. */
  context?: unknown;
}

export interface OauthContextStoreDeps {
  loadRecords: () => Promise<OauthContextConfigRecord[]>;
  saveRecords: (records: OauthContextConfigRecord[]) => Promise<void>;
  now?: () => number;
}

export const OAUTH_CONTEXT_MAX_ENTRIES = 10;
export const OAUTH_CONTEXT_TTL_MS = 30 * 60 * 1000;

function isCookieEntries(value: unknown): value is Array<[string, string]> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'string',
    )
  );
}

function normalizeContext(value: unknown): PendingOauthContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = value as {
    createdAtMs?: unknown;
    cookieEntries?: unknown;
    guid?: unknown;
    clientUuid?: unknown;
  };
  if (typeof candidate.createdAtMs !== 'number' || !isCookieEntries(candidate.cookieEntries)) {
    return null;
  }
  if (candidate.guid !== undefined && typeof candidate.guid !== 'string') {
    return null;
  }
  if (candidate.clientUuid !== undefined && typeof candidate.clientUuid !== 'string') {
    return null;
  }
  return {
    cookieEntries: candidate.cookieEntries,
    createdAtMs: candidate.createdAtMs,
    guid: candidate.guid,
    clientUuid: candidate.clientUuid,
  };
}

export interface OauthContextStore {
  hydrate(): Promise<void>;
  remember(state: string, context: PendingOauthContext): Promise<void>;
  restore(state: string): Promise<PendingOauthContext | undefined>;
  remove(state: string): Promise<void>;
  /** Valid (non-expired) contexts with their states, oldest last. */
  entries(): Array<[string, PendingOauthContext]>;
  size(): number;
}

export function createOauthContextStore(deps: OauthContextStoreDeps): OauthContextStore {
  const now = deps.now ?? Date.now;
  const contexts = new Map<string, PendingOauthContext>();
  let hydrated = false;

  const isExpired = (createdAtMs: number) => now() - createdAtMs > OAUTH_CONTEXT_TTL_MS;

  function prune() {
    for (const [state, context] of contexts.entries()) {
      if (isExpired(context.createdAtMs)) {
        contexts.delete(state);
      }
    }
    while (contexts.size > OAUTH_CONTEXT_MAX_ENTRIES) {
      const oldestState = Array.from(contexts.entries()).sort(
        (left, right) => left[1].createdAtMs - right[1].createdAtMs,
      )[0]?.[0];
      if (!oldestState) {
        break;
      }
      contexts.delete(oldestState);
    }
  }

  async function persist() {
    prune();
    await deps.saveRecords(
      Array.from(contexts.entries()).map(([state, context]) => ({
        state,
        cookieEntries: context.cookieEntries,
        createdAtMs: context.createdAtMs,
        guid: context.guid,
        clientUuid: context.clientUuid,
      })),
    );
  }

  async function hydrate() {
    if (hydrated) {
      return;
    }
    hydrated = true;

    const records = await deps.loadRecords();
    for (const record of records) {
      if (!record || typeof record !== 'object' || typeof record.state !== 'string') {
        continue;
      }
      if (!record.state) {
        continue;
      }
      const wrapped = normalizeContext(record.context);
      const direct = normalizeContext(record);
      const normalized = wrapped ?? direct;
      if (!normalized || isExpired(normalized.createdAtMs)) {
        continue;
      }
      contexts.set(record.state, normalized);
    }
    prune();
  }

  return {
    hydrate,
    size: () => contexts.size,
    entries() {
      return Array.from(contexts.entries()).filter(
        ([, context]) => !isExpired(context.createdAtMs),
      );
    },
    async remember(state, context) {
      await hydrate();
      contexts.set(state, {
        cookieEntries: context.cookieEntries,
        createdAtMs: now(),
        guid: context.guid,
        clientUuid: context.clientUuid,
      });
      await persist();
    },
    async restore(state) {
      await hydrate();
      const context = contexts.get(state);
      if (!context || isExpired(context.createdAtMs)) {
        return undefined;
      }
      return context;
    },
    async remove(state) {
      await hydrate();
      if (!state || !contexts.has(state)) {
        return;
      }
      contexts.delete(state);
      await persist();
    },
  };
}
