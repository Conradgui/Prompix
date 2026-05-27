import type { TermFollowupMessage } from '../types';

export interface TermFollowupThread {
  term: string;
  language: string;
  messages: TermFollowupMessage[];
  updatedAt: number;
}

export type TermFollowupThreadCache = Record<string, TermFollowupThread>;

const STORAGE_KEY = 'PROMPIX_TERM_FOLLOWUPS_V1';

const normalizeText = (value: string): string => (value || '').trim().toLowerCase();

export const buildTermFollowupKey = (term: string, language: string): string => {
  return `${normalizeText(language)}::${normalizeText(term)}`;
};

const normalizeMessage = (message: Partial<TermFollowupMessage>): TermFollowupMessage | null => {
  const role = message.role === 'user' || message.role === 'model' ? message.role : null;
  const text = String(message.text || '').trim();
  if (!role || !text) return null;

  return {
    id: String(message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    role,
    text,
    timestamp: Number(message.timestamp) || Date.now(),
    thinking: String(message.thinking || '').trim() || undefined,
  };
};

export const loadTermFollowupCache = (): TermFollowupThreadCache => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TermFollowupThreadCache;
  } catch {
    return {};
  }
};

export const saveTermFollowupCache = (cache: TermFollowupThreadCache): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore write errors to avoid interrupting main UX
  }
};

export const getTermFollowupThread = (
  cache: TermFollowupThreadCache,
  term: string,
  language: string,
): TermFollowupThread | null => {
  const key = buildTermFollowupKey(term, language);
  return cache[key] || null;
};

export const upsertTermFollowupThread = (
  cache: TermFollowupThreadCache,
  term: string,
  language: string,
  messages: TermFollowupMessage[],
): TermFollowupThreadCache => {
  const key = buildTermFollowupKey(term, language);
  const normalized = messages
    .map((msg) => normalizeMessage(msg))
    .filter((msg): msg is TermFollowupMessage => Boolean(msg));

  return {
    ...cache,
    [key]: {
      term,
      language,
      messages: normalized,
      updatedAt: Date.now(),
    },
  };
};

export const appendTermFollowupMessages = (
  cache: TermFollowupThreadCache,
  term: string,
  language: string,
  incoming: TermFollowupMessage[],
): TermFollowupThreadCache => {
  const current = getTermFollowupThread(cache, term, language);
  return upsertTermFollowupThread(cache, term, language, [...(current?.messages || []), ...incoming]);
};

export const clearTermFollowupThread = (
  cache: TermFollowupThreadCache,
  term: string,
  language: string,
): TermFollowupThreadCache => {
  const key = buildTermFollowupKey(term, language);
  const next = { ...cache };
  delete next[key];
  return next;
};
