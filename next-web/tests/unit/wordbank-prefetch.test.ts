import { describe, expect, it } from 'vitest';
import { buildPrefetchQueue, prioritizeQueueTerm } from '../../lib/utils/wordbankPrefetch';
import { TermExplanationCache, upsertTermExplanationCache } from '../../lib/utils/termExplanationCache';

describe('wordbank prefetch queue', () => {
  it('builds queue only for uncached terms with stable order', () => {
    let cache: TermExplanationCache = {};
    cache = upsertTermExplanationCache(cache, 'Cyberpunk', 'Chinese', {
      def: 'A',
      app: 'B',
    });

    const queue = buildPrefetchQueue(
      ['Cyberpunk', 'Negative Space', 'Color Blocking', 'negative space'],
      'Chinese',
      cache,
    );

    expect(queue).toEqual(['Negative Space', 'Color Blocking']);
  });

  it('prioritizes selected term to queue head without duplicates', () => {
    const queue = prioritizeQueueTerm(['A', 'B', 'C'], 'B');
    expect(queue).toEqual(['B', 'A', 'C']);

    const queue2 = prioritizeQueueTerm(queue, 'D');
    expect(queue2).toEqual(['D', 'B', 'A', 'C']);
  });
});
