import { describe, expect, it } from 'vitest';
import { buildPrefetchQueue, prioritizeQueueTerm } from '../../lib/utils/wordbankPrefetch';
import { TermExplanationCache } from '../../lib/utils/termExplanationCache';

describe('wordbank prefetch utility', () => {
  const language = 'Chinese';

  it('filters out already cached valid term explanations', () => {
    const minedTerms = [
      { term: 'Cyberpunk', category: 'style' },
      { term: 'Warm Light', category: 'lighting' },
      { term: 'Low Angle', category: 'composition' },
    ];

    // Mock cache where Cyberpunk is already explained
    const cache: TermExplanationCache = {
      'chinese::cyberpunk': {
        term: 'Cyberpunk',
        language: 'Chinese',
        def: '赛博朋克是一种视觉风格。',
        app: '在生图中使用霓虹和高科技元素。',
        updatedAt: Date.now(),
      },
    };

    const queue = buildPrefetchQueue(minedTerms, language, cache);
    expect(queue).toHaveLength(2);
    expect(queue[0].term).toBe('Low Angle'); // composition has priority over lighting
    expect(queue[1].term).toBe('Warm Light'); // lighting
  });

  it('orders terms based on CATEGORY_PRIORITY', () => {
    const minedTerms = [
      { term: 'Neon Lights', category: 'lighting' },
      { term: 'A beautiful girl', category: 'subject' },
      { term: 'Futuristic Style', category: 'style' },
      { term: 'Cinematic Shot', category: 'composition' },
      { term: 'Rainy Night', category: 'environment' },
      { term: 'Mysterious Mood', category: 'mood' },
    ];

    const queue = buildPrefetchQueue(minedTerms, language, {});
    expect(queue).toHaveLength(6);
    expect(queue[0].category).toBe('subject');
    expect(queue[1].category).toBe('environment');
    expect(queue[2].category).toBe('composition');
    expect(queue[3].category).toBe('lighting');
    expect(queue[4].category).toBe('mood');
    expect(queue[5].category).toBe('style');
  });

  it('prioritizes active term to the front of the queue', () => {
    const queue = [
      { term: 'Neon Lights', category: 'lighting' },
      { term: 'Cinematic Shot', category: 'composition' },
      { term: 'Cyberpunk', category: 'style' },
    ];

    const prioritized = prioritizeQueueTerm(queue, 'Cyberpunk');
    expect(prioritized[0].term).toBe('Cyberpunk');
    expect(prioritized[1].term).toBe('Neon Lights');
    expect(prioritized[2].term).toBe('Cinematic Shot');
  });

  it('handles prioritizing non-existent or empty term gracefully', () => {
    const queue = [
      { term: 'Neon Lights', category: 'lighting' },
    ];

    const res1 = prioritizeQueueTerm(queue, '');
    expect(res1).toEqual(queue);

    const res2 = prioritizeQueueTerm(queue, 'Nonexistent');
    expect(res2).toEqual(queue);
  });

  it('caps the queue length at 15', () => {
    const minedTerms = Array.from({ length: 25 }, (_, i) => ({
      term: `Term ${i}`,
      category: 'style'
    }));

    const queue = buildPrefetchQueue(minedTerms, language, {});
    expect(queue).toHaveLength(15);
  });
});
