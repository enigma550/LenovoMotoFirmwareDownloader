import { describe, expect, test } from 'bun:test';
import {
  createOauthContextStore,
  OAUTH_CONTEXT_MAX_ENTRIES,
  OAUTH_CONTEXT_TTL_MS,
  type OauthContextConfigRecord,
} from './oauth-context-store.ts';

function createMemoryDeps(initial: OauthContextConfigRecord[] = [], nowMs = 1_000_000) {
  const saved: OauthContextConfigRecord[][] = [];
  const deps = {
    loadRecords: async () => initial,
    saveRecords: async (records: OauthContextConfigRecord[]) => {
      saved.push(records.map((record) => ({ ...record })));
    },
    now: () => nowMs,
  };
  return { deps, saved };
}

describe('createOauthContextStore', () => {
  test('remembers contexts and persists them', async () => {
    const { deps, saved } = createMemoryDeps();
    const store = createOauthContextStore(deps);

    await store.remember('state-1', {
      cookieEntries: [['a', 'b']],
      createdAtMs: 0,
      guid: 'g',
      clientUuid: 'c',
    });

    expect(saved.at(-1)).toEqual([
      {
        state: 'state-1',
        cookieEntries: [['a', 'b']],
        createdAtMs: 1_000_000,
        guid: 'g',
        clientUuid: 'c',
      },
    ]);
    expect(await store.restore('state-1')).toMatchObject({ guid: 'g' });
  });

  test('restore rejects unknown and expired states', async () => {
    const nowMs = 1_000_000_000;
    const { deps } = createMemoryDeps(
      [
        {
          state: 'expired',
          cookieEntries: [['a', 'b']],
          createdAtMs: nowMs - OAUTH_CONTEXT_TTL_MS - 1,
        },
      ],
      nowMs,
    );
    const store = createOauthContextStore(deps);

    expect(await store.restore('missing')).toBeUndefined();
    expect(await store.restore('expired')).toBeUndefined();
  });

  test('hydrate accepts flat and legacy wrapped records and skips garbage', async () => {
    const nowMs = 5_000_000;
    const records = [
      {
        state: 'flat',
        cookieEntries: [['a', 'b']],
        createdAtMs: nowMs - 1000,
      },
      {
        state: 'wrapped',
        context: {
          cookieEntries: [['x', 'y']],
          createdAtMs: nowMs - 1000,
          guid: 'g2',
        },
      },
      { state: 'bad', cookieEntries: 'nope', createdAtMs: nowMs },
      { cookieEntries: [['a', 'b']], createdAtMs: nowMs },
    ] as unknown as OauthContextConfigRecord[];
    const { deps } = createMemoryDeps(records, nowMs);
    const store = createOauthContextStore(deps);

    expect((await store.restore('flat'))?.cookieEntries).toEqual([['a', 'b']]);
    expect((await store.restore('wrapped'))?.guid).toBe('g2');
    expect(await store.restore('bad')).toBeUndefined();
  });

  test('prunes expired entries and enforces the entry cap', async () => {
    const nowMs = 10_000_000;
    const { deps, saved } = createMemoryDeps([], nowMs);
    const store = createOauthContextStore(deps);

    for (let index = 0; index < OAUTH_CONTEXT_MAX_ENTRIES + 2; index += 1) {
      await store.remember(`state-${index}`, {
        cookieEntries: [],
        createdAtMs: 0,
      });
    }

    const persisted = saved.at(-1) ?? [];
    expect(persisted).toHaveLength(OAUTH_CONTEXT_MAX_ENTRIES);
    // oldest entries were dropped first
    expect(persisted[0]?.state).toBe('state-2');
  });

  test('entries lists valid contexts with their states', async () => {
    const nowMs = 9_000_000;
    const { deps } = createMemoryDeps(
      [
        { state: 'a', cookieEntries: [['x', 'y']], createdAtMs: nowMs - 10 },
        {
          state: 'expired',
          cookieEntries: [],
          createdAtMs: nowMs - OAUTH_CONTEXT_TTL_MS - 1,
        },
      ],
      nowMs,
    );
    const store = createOauthContextStore(deps);
    await store.hydrate();

    expect(store.entries().map(([state]) => state)).toEqual(['a']);
  });

  test('remove deletes the entry and persists', async () => {
    const { deps, saved } = createMemoryDeps();
    const store = createOauthContextStore(deps);
    await store.remember('state-1', { cookieEntries: [], createdAtMs: 0 });

    await store.remove('state-1');
    expect(await store.restore('state-1')).toBeUndefined();
    expect(saved.at(-1)).toEqual([]);

    // removing an unknown state must not write
    const writesBefore = saved.length;
    await store.remove('nope');
    expect(saved.length).toBe(writesBefore);
  });
});
