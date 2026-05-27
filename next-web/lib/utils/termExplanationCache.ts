import type { ManagedMeta } from '../types';
import type { TermExplanation } from '../services/geminiService';

export interface TermExplanationCacheItem extends TermExplanation {
  term: string;
  language: string;
  thinking?: string;
  updatedAt: number;
}

export type TermExplanationCache = Record<string, TermExplanationCacheItem>;

const STORAGE_KEY = 'PROMPIX_TERM_EXPLANATIONS_V1';

const normalizeText = (value: string): string => (value || '').trim().toLowerCase();

export const buildTermCacheKey = (term: string, language: string): string => {
  return `${normalizeText(language)}::${normalizeText(term)}`;
};

export const loadTermExplanationCache = (): TermExplanationCache => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TermExplanationCache;
  } catch {
    return {};
  }
};

export const saveTermExplanationCache = (cache: TermExplanationCache): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // 忽略存储失败，避免影响主流程
  }
};

export const getCachedTermExplanation = (
  cache: TermExplanationCache,
  term: string,
  language: string,
): TermExplanationCacheItem | null => {
  const key = buildTermCacheKey(term, language);
  return cache[key] || null;
};

export const upsertTermExplanationCache = (
  cache: TermExplanationCache,
  term: string,
  language: string,
  explanation: TermExplanation,
  meta?: ManagedMeta,
): TermExplanationCache => {
  const key = buildTermCacheKey(term, language);
  return {
    ...cache,
    [key]: {
      term,
      language,
      def: explanation.def || '',
      app: explanation.app || '',
      thinking: meta?.thinking || '',
      updatedAt: Date.now(),
    },
  };
};

export const isValidTermExplanation = (value: Partial<TermExplanation> | null | undefined): boolean => {
  return Boolean(value?.def?.trim() && value?.app?.trim());
};
