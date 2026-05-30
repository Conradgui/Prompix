import { describe, expect, it } from 'vitest';
import { AnalysisResult, HistoryItem } from '../../lib/types';
import {
  getHistoryAnalysisByLanguage,
  resolveHistoryPromptLanguage,
  upsertHistoryAnalysisVariant,
  swapAnalysisResultLanguage,
} from '../../lib/utils/analysisLanguage';

const makeAnalysis = (subject: string): AnalysisResult => ({
  description: '',
  structuredPrompts: {
    subject: { original: subject, translated: '' },
    environment: { original: subject, translated: '' },
    composition: { original: subject, translated: '' },
    lighting: { original: subject, translated: '' },
    mood: { original: subject, translated: '' },
    style: { original: subject, translated: '' },
  },
});

const makeItem = (analysis: AnalysisResult): HistoryItem => ({
  id: '1',
  timestamp: 1,
  imageUrl: 'data:image/png;base64,1',
  analysis,
  read: true,
});

describe('analysis language helpers', () => {
  it('respects explicit promptLanguage', () => {
    const item = {
      ...makeItem(makeAnalysis('A cinematic portrait')),
      promptLanguage: 'zh' as const,
    };
    expect(resolveHistoryPromptLanguage(item, 'en')).toBe('zh');
  });

  it('infers language from legacy analysis content', () => {
    const zhItem = makeItem(makeAnalysis('一位站在天台的女性'));
    const enItem = makeItem(makeAnalysis('A woman standing on a rooftop'));
    expect(resolveHistoryPromptLanguage(zhItem, 'en')).toBe('zh');
    expect(resolveHistoryPromptLanguage(enItem, 'zh')).toBe('en');
  });

  it('returns cached variant immediately', () => {
    const zh = makeAnalysis('中文版本');
    const en = makeAnalysis('English version');
    const item: HistoryItem = {
      ...makeItem(en),
      promptLanguage: 'en',
      analysisVariants: { en, zh },
    };
    expect(getHistoryAnalysisByLanguage(item, 'zh')).toBe(zh);
    expect(getHistoryAnalysisByLanguage(item, 'en')).toBe(en);
  });

  it('keeps legacy fallback for inferred active language', () => {
    const legacy = makeItem(makeAnalysis('A woman standing on a rooftop'));
    expect(getHistoryAnalysisByLanguage(legacy, 'en')).toBe(legacy.analysis);
    expect(getHistoryAnalysisByLanguage(legacy, 'zh')).toBeNull();
  });

  it('upserts variant and updates both zh and en variants simultaneously', () => {
    const en = makeAnalysis('English version');
    const zh = makeAnalysis('中文版本');
    const item = makeItem(en);
    const updated = upsertHistoryAnalysisVariant(item, 'zh', zh);

    expect(updated.promptLanguage).toBe('zh');
    expect(updated.analysis).toBe(zh);
    expect(updated.analysisVariants?.zh).toBe(zh);
    expect(updated.analysisVariants?.en?.structuredPrompts.subject.original).toBe(zh.structuredPrompts.subject.translated);
  });

  it('swaps prompt original and translated fields correctly', () => {
    const orig: AnalysisResult = {
      description: 'test description',
      structuredPrompts: {
        subject: { original: 'A boy', translated: '一个男孩' },
        environment: { original: 'Rain', translated: '雨天' },
        composition: { original: 'Portrait', translated: '肖像' },
        lighting: { original: 'Bright', translated: '明亮' },
        mood: { original: 'Happy', translated: '快乐' },
        style: { original: 'Art', translated: '艺术' },
      }
    };
    const swapped = swapAnalysisResultLanguage(orig);
    expect(swapped.structuredPrompts.subject.original).toBe('一个男孩');
    expect(swapped.structuredPrompts.subject.translated).toBe('A boy');
  });

  it('dynamically swaps legacy cached variant if requested language is missing', () => {
    const en: AnalysisResult = {
      description: 'legacy',
      structuredPrompts: {
        subject: { original: 'A boy', translated: '一个男孩' },
        environment: { original: 'Rain', translated: '雨天' },
        composition: { original: 'Portrait', translated: '肖像' },
        lighting: { original: 'Bright', translated: '明亮' },
        mood: { original: 'Happy', translated: '快乐' },
        style: { original: 'Art', translated: '艺术' },
      }
    };
    const item: HistoryItem = {
      ...makeItem(en),
      promptLanguage: 'en',
      analysisVariants: { en },
    };
    const result = getHistoryAnalysisByLanguage(item, 'zh');
    expect(result).not.toBeNull();
    expect(result?.structuredPrompts.subject.original).toBe('一个男孩');
    expect(result?.structuredPrompts.subject.translated).toBe('A boy');
  });
});

