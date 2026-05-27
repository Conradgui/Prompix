import { del, get, set } from 'idb-keyval';

export const STORAGE_KEYS = {
  settings: 'prompixSettings',
  history: 'prompixHistory',
  legacySettings: 'visionLearnSettings',
  legacyHistory: 'visionLearnHistory',
  termExplanations: 'PROMPIX_TERM_EXPLANATIONS_V1',
  termFollowups: 'PROMPIX_TERM_FOLLOWUPS_V1',
};

export async function loadWithLegacy<T>(primaryKey: string, legacyKey: string): Promise<T | null> {
  const primary = await get<T>(primaryKey);
  if (primary) return primary;

  const legacy = await get<T>(legacyKey);
  if (legacy) {
    await set(primaryKey, legacy);
    return legacy;
  }

  return null;
}

export async function savePrimary<T>(primaryKey: string, value: T): Promise<void> {
  await set(primaryKey, value);
}

export async function loadSettings<T>(): Promise<T | null> {
  return loadWithLegacy<T>(STORAGE_KEYS.settings, STORAGE_KEYS.legacySettings);
}

export async function loadHistory<T>(): Promise<T | null> {
  return loadWithLegacy<T>(STORAGE_KEYS.history, STORAGE_KEYS.legacyHistory);
}

export async function clearLegacyHistoryAndWordbankCache(): Promise<void> {
  await Promise.all([
    del(STORAGE_KEYS.history),
    del(STORAGE_KEYS.legacyHistory),
  ]);

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEYS.termExplanations);
    window.localStorage.removeItem(STORAGE_KEYS.termFollowups);
  }
}

export const getImageStorageKey = (id: string) => `prompixImage_${id}`;

export async function saveHistoryImage(id: string, base64Image: string): Promise<void> {
  await set(getImageStorageKey(id), base64Image);
}

export async function loadHistoryImage(id: string): Promise<string | null> {
  return (await get<string>(getImageStorageKey(id))) || null;
}

export async function deleteHistoryImage(id: string): Promise<void> {
  await del(getImageStorageKey(id));
}
