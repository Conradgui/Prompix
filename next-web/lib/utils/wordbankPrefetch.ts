import { TermExplanationCache, getCachedTermExplanation, isValidTermExplanation } from './termExplanationCache';

// 严格对应用户体验的展示顺序
const CATEGORY_PRIORITY: Record<string, number> = {
  subject: 1,
  environment: 2,
  composition: 3,
  lighting: 4,
  mood: 5,
  style: 6,
};

export interface PrefetchQueueItem {
  term: string;
  category: string;
}

export const buildPrefetchQueue = (
  minedTerms: { term: string; category: string }[],
  language: string,
  cache: TermExplanationCache,
): PrefetchQueueItem[] => {
  const seen = new Set<string>();
  const queue: PrefetchQueueItem[] = [];

  // 1. 去重并提取尚未解释缓存的词汇
  for (const item of minedTerms) {
    const term = String(item.term || '').trim();
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cached = getCachedTermExplanation(cache, term, language);
    if (cached && isValidTermExplanation(cached)) continue;

    queue.push(item);
  }

  // 2. 按照主体 -> 环境 -> 构图 -> 光照 -> 情绪 -> 风格进行稳定性排序
  const sortedQueue = queue.sort((a, b) => {
    const prioA = CATEGORY_PRIORITY[a.category] ?? 99;
    const prioB = CATEGORY_PRIORITY[b.category] ?? 99;
    return prioA - prioB;
  });

  // 限制最大预取长度为 15 个词汇
  return sortedQueue.slice(0, 15);
};

export const prioritizeQueueTerm = (queue: PrefetchQueueItem[], term: string): PrefetchQueueItem[] => {
  const target = String(term || '').trim();
  if (!target) return [...queue];

  const targetLower = target.toLowerCase();
  const matched = queue.find((item) => item.term.toLowerCase() === targetLower);
  const remaining = queue.filter((item) => item.term.toLowerCase() !== targetLower);

  if (matched) {
    return [matched, ...remaining];
  }
  return queue;
};
