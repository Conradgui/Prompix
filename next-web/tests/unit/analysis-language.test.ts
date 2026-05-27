import { describe, expect, it } from 'vitest';
import { AnalysisResult, HistoryItem } from '../../lib/types';
import {
  getHistoryAnalysisByLanguage,
  resolveHistoryPromptLanguage,
  upsertHistoryAnalysisVariant,
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

  it('upserts variant and updates active language', () => {
    const en = makeAnalysis('English version');
    const zh = makeAnalysis('中文版本');
    const item = makeItem(en);
    const updated = upsertHistoryAnalysisVariant(item, 'zh', zh);

    expect(updated.promptLanguage).toBe('zh');
    expect(updated.analysis).toBe(zh);
    expect(updated.analysisVariants?.zh).toBe(zh);
  });
});

