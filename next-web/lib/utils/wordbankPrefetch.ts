import { TermExplanationCache, getCachedTermExplanation, isValidTermExplanation } from './termExplanationCache';

export const buildPrefetchQueue = (
  orderedTerms: string[],
  language: string,
  cache: TermExplanationCache,
): string[] => {
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const raw of orderedTerms) {
    const term = String(raw || '').trim();
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cached = getCachedTermExplanation(cache, term, language);
    if (cached && isValidTermExplanation(cached)) continue;

    queue.push(term);
  }

  return queue;
};

export const prioritizeQueueTerm = (queue: string[], term: string): string[] => {
  const target = String(term || '').trim();
  if (!target) return [...queue];

  const unique = Array.from(new Set(queue.map((item) => String(item || '').trim()).filter(Boolean)));
  const index = unique.findIndex((item) => item.toLowerCase() === target.toLowerCase());

  if (index >= 0) {
    unique.splice(index, 1);
  }

  return [target, ...unique];
};
