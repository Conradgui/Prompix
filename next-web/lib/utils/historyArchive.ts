import { HistoryItem } from '../types';

interface ExportPayload {
  version: number;
  exportedAt: number;
  items: HistoryItem[];
}

const normalizeText = (value: string | undefined): string => {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
};

const fingerprint = (item: HistoryItem): string => {
  const sp = item.analysis.structuredPrompts;
  const parts = [
    normalizeText(item.analysis.description),
    normalizeText(sp.subject?.original),
    normalizeText(sp.subject?.translated),
    normalizeText(sp.environment?.original),
    normalizeText(sp.environment?.translated),
    normalizeText(sp.composition?.original),
    normalizeText(sp.composition?.translated),
    normalizeText(sp.lighting?.original),
    normalizeText(sp.lighting?.translated),
    normalizeText(sp.mood?.original),
    normalizeText(sp.mood?.translated),
    normalizeText(sp.style?.original),
    normalizeText(sp.style?.translated),
  ];
  return parts.join('|');
};

const isHistoryItem = (input: any): input is HistoryItem => {
  return Boolean(
    input
    && typeof input.id === 'string'
    && typeof input.timestamp === 'number'
    && typeof input.imageUrl === 'string'
    && input.analysis
    && input.analysis.structuredPrompts,
  );
};

export const buildHistoryExportPayload = (items: HistoryItem[]): ExportPayload => {
  return {
    version: 1,
    exportedAt: Date.now(),
    items,
  };
};

export const parseHistoryImportPayload = (raw: string): HistoryItem[] => {
  if (!raw.trim()) return [];

  const parsed = JSON.parse(raw);
  const source = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(source)) return [];

  return source.filter(isHistoryItem);
};

export const mergeHistoryWithDedupe = (
  current: HistoryItem[],
  incoming: HistoryItem[],
): { merged: HistoryItem[]; added: number } => {
  const map = new Map<string, HistoryItem>();
  const seed = [...current];
  for (const item of seed) {
    map.set(fingerprint(item), item);
  }

  let added = 0;
  for (const item of incoming) {
    const key = fingerprint(item);
    const exists = map.get(key);
    if (!exists) {
      map.set(key, item);
      added += 1;
      continue;
    }
    if ((item.timestamp || 0) > (exists.timestamp || 0)) {
      map.set(key, item);
    }
  }

  const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  return { merged, added };
};
