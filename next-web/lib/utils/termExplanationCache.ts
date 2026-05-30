import type { ManagedMeta } from '../types';
import type { TermExplanation } from '../services/geminiService';
import { AESTHETIC_TERMS } from '../data/aestheticTerms';

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

// 新增查找函数，用于从本地预设库检索定义
export const getStaticPresetExplanation = (
  term: string,
  language: string,
): { def: string; app: string } | null => {
  const normTerm = term.trim().toLowerCase();
  const langKey = language.trim().toLowerCase().startsWith('chin') ? 'Chinese' : 'English';
  
  const found = AESTHETIC_TERMS.find(t => {
    const enTerm = (t.languages.English?.term || '').trim().toLowerCase();
    const zhTerm = (t.languages.Chinese?.term || '').trim().toLowerCase();
    return enTerm === normTerm || zhTerm === normTerm;
  });

  if (found) {
    const content = found.languages[langKey] || found.languages.English;
    if (content && content.def && content.app) {
      return {
        def: content.def,
        app: content.app,
      };
    }
  }
  return null;
};

export const getCachedTermExplanation = (
  cache: TermExplanationCache,
  term: string,
  language: string,
): TermExplanationCacheItem | null => {
  const key = buildTermCacheKey(term, language);
  const cached = cache[key];
  if (cached && isValidTermExplanation(cached)) {
    return cached;
  }

  // 本地预设旁路拦截
  const staticPreset = getStaticPresetExplanation(term, language);
  if (staticPreset) {
    return {
      term,
      language,
      def: staticPreset.def,
      app: staticPreset.app,
      updatedAt: Date.now(),
    };
  }

  return null;
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
