import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import { clearLegacyHistoryAndWordbankCache, loadHistory, loadSettings, STORAGE_KEYS } from '../../lib/state/storage';

describe('storage migration compatibility', () => {
  beforeEach(() => {
    store.clear();
    window.localStorage.clear();
  });

  it('reads primary settings first', async () => {
    store.set(STORAGE_KEYS.settings, { systemLanguage: 'Chinese' });
    store.set(STORAGE_KEYS.legacySettings, { systemLanguage: 'English' });

    const loaded = await loadSettings<{ systemLanguage: string }>();
    expect(loaded?.systemLanguage).toBe('Chinese');
  });

  it('falls back to legacy and writes back to primary', async () => {
    store.set(STORAGE_KEYS.legacyHistory, [{ id: '1' }]);

    const loaded = await loadHistory<Array<{ id: string }>>();
    expect(loaded?.[0]?.id).toBe('1');
    expect(store.get(STORAGE_KEYS.history)).toEqual([{ id: '1' }]);
  });

  it('clears history and wordbank caches but keeps settings', async () => {
    store.set(STORAGE_KEYS.history, [{ id: 'new' }]);
    store.set(STORAGE_KEYS.legacyHistory, [{ id: 'old' }]);
    store.set(STORAGE_KEYS.settings, { systemLanguage: 'Chinese' });

    window.localStorage.setItem(STORAGE_KEYS.termExplanations, '{"a":1}');
    window.localStorage.setItem(STORAGE_KEYS.termFollowups, '{"b":1}');

    await clearLegacyHistoryAndWordbankCache();

    expect(store.get(STORAGE_KEYS.history)).toBeUndefined();
    expect(store.get(STORAGE_KEYS.legacyHistory)).toBeUndefined();
    expect(store.get(STORAGE_KEYS.settings)).toEqual({ systemLanguage: 'Chinese' });
    expect(window.localStorage.getItem(STORAGE_KEYS.termExplanations)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.termFollowups)).toBeNull();
  });
});
