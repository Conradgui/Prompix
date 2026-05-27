import { describe, expect, it } from 'vitest';
import { HistoryItem } from '../../lib/types';
import { mineHistory } from '../../lib/utils/historyMiner';

const makeItem = (): HistoryItem => ({
  id: '1',
  timestamp: Date.now(),
  imageUrl: 'data:image/png;base64,abc',
  analysis: {
    description: 'demo',
    structuredPrompts: {
      subject: { original: '银发女性, 黑色风衣', translated: '' },
      environment: { original: '雨夜街道, 霓虹反射', translated: '' },
      composition: { original: '三分法构图, 低机位', translated: '' },
      lighting: { original: '冷色主光, 轮廓光', translated: '' },
      mood: { original: '神秘氛围, 孤独感', translated: '' },
      style: { original: '电影感, 超写实', translated: '' },
    },
  },
});

describe('history miner', () => {
  it('mines terms from all six structured dimensions', () => {
    const result = mineHistory([makeItem()]);
    const categories = new Set(result.filter((item) => !item.isPreset).map((item) => item.category));

    expect(categories.has('subject')).toBe(false);
    expect(categories.has('environment')).toBe(false);
    expect(categories.has('composition')).toBe(true);
    expect(categories.has('lighting')).toBe(true);
    expect(categories.has('mood')).toBe(true);
    expect(categories.has('style')).toBe(true);
  });

  it('dedupes term values case-insensitively', () => {
    const itemA = makeItem();
    itemA.analysis.structuredPrompts.style.original = 'Cyberpunk, 电影感';
    const itemB = makeItem();
    itemB.id = '2';
    itemB.imageUrl = 'data:image/png;base64,xyz';
    itemB.analysis.structuredPrompts.style.original = 'cyberpunk, 超写实';

    const result = mineHistory([itemA, itemB]);
    const cyberpunk = result.filter((item) => item.term.toLowerCase() === 'cyberpunk' && !item.isPreset);

    expect(cyberpunk).toHaveLength(1);
    expect(cyberpunk[0].images).toHaveLength(2);
  });

  it('keeps deterministic order for the same input', () => {
    const itemA = makeItem();
    itemA.analysis.structuredPrompts.style.original = 'Cyberpunk, Film Noir';
    const itemB = makeItem();
    itemB.id = '2';
    itemB.imageUrl = 'data:image/png;base64,xyz';
    itemB.analysis.structuredPrompts.style.original = 'cyberpunk, Minimalism';

    const result1 = mineHistory([itemA, itemB]).map((entry) => `${entry.term}:${entry.category}`);
    const result2 = mineHistory([itemA, itemB]).map((entry) => `${entry.term}:${entry.category}`);

    expect(result1).toEqual(result2);
  });
});
