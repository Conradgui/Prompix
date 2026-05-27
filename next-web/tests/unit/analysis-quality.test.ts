import { describe, expect, it } from 'vitest';
import { AnalysisResult } from '../../lib/types';
import { getMissingDimensions } from '../../lib/utils/analysisQuality';

const makeAnalysis = (overrides?: Partial<AnalysisResult>): AnalysisResult => ({
  description: 'desc',
  structuredPrompts: {
    subject: { original: 'subject', translated: '' },
    environment: { original: 'environment', translated: '' },
    composition: { original: 'composition', translated: '' },
    lighting: { original: 'lighting', translated: '' },
    mood: { original: 'mood', translated: '' },
    style: { original: 'style', translated: '' },
  },
  ...overrides,
});

describe('analysis quality helpers', () => {
  it('detects missing dimensions by empty original text', () => {
    const analysis = makeAnalysis({
      structuredPrompts: {
        subject: { original: 'subject', translated: '' },
        environment: { original: '', translated: '' },
        composition: { original: 'composition', translated: '' },
        lighting: { original: ' ', translated: '' },
        mood: { original: 'mood', translated: '' },
        style: { original: '', translated: '' },
      },
    });

    expect(getMissingDimensions(analysis)).toEqual(['environment', 'lighting', 'style']);
  });

  it('returns all dimensions when analysis is absent', () => {
    expect(getMissingDimensions(null)).toEqual([
      'subject',
      'environment',
      'composition',
      'lighting',
      'mood',
      'style',
    ]);
  });
});

