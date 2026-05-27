import { describe, expect, it } from 'vitest';
import { AnalysisResult, ExternalReviewFeedback, HistoryItem } from '../../lib/types';
import {
  applyOptimizationMemories,
  buildMemoryPatchFromFeedback,
  resolveActiveMemoryIds,
} from '../../lib/utils/optimizationMemory';

const makeAnalysis = (subject: string): AnalysisResult => ({
  description: 'demo',
  structuredPrompts: {
    subject: { original: subject, translated: '' },
    environment: { original: 'env', translated: '' },
    composition: { original: 'comp', translated: '' },
    lighting: { original: 'light', translated: '' },
    mood: { original: 'mood', translated: '' },
    style: { original: 'style', translated: '' },
  },
});

const makeFeedback = (): ExternalReviewFeedback => ({
  version: 1,
  language: 'en',
  overallSummary: 'summary',
  keyIssues: ['i1'],
  strategies: ['s1'],
  dimensions: {
    subject: { score: 8, issues: 'i', rewrite: 'rewritten subject', rationale: 'r' },
    environment: { score: 8, issues: 'i', rewrite: 'rewritten env', rationale: 'r' },
    composition: { score: 8, issues: 'i', rewrite: 'rewritten comp', rationale: 'r' },
    lighting: { score: 8, issues: 'i', rewrite: 'rewritten light', rationale: 'r' },
    mood: { score: 8, issues: 'i', rewrite: 'rewritten mood', rationale: 'r' },
    style: { score: 8, issues: 'i', rewrite: 'rewritten style', rationale: 'r' },
  },
});

describe('optimization memory', () => {
  it('applies active memories in matching language only', () => {
    const base = makeAnalysis('base subject');
    const result = applyOptimizationMemories(base, [
      {
        id: 'm1',
        title: 'm1',
        createdAt: 1,
        language: 'en',
        source: 'external-review',
        overallSummary: 'sum',
        keyIssues: ['i1'],
        feedback: makeFeedback(),
        patch: { subject: 'improved subject' },
      },
      {
        id: 'm2',
        title: 'm2',
        createdAt: 1,
        language: 'zh',
        source: 'external-review',
        overallSummary: 'sum',
        keyIssues: ['i1'],
        feedback: { ...makeFeedback(), language: 'zh' },
        patch: { subject: '中文主体' },
      },
    ], ['m1', 'm2'], 'en');

    expect(result.structuredPrompts.subject.original).toBe('improved subject');
  });

  it('prefers published version memory IDs when available', () => {
    const item: HistoryItem = {
      id: '1',
      timestamp: 1,
      imageUrl: 'data:image/png;base64,1',
      read: true,
      analysis: makeAnalysis('base'),
      optimizationMemories: [
        {
          id: 'm1',
          title: 'm1',
          createdAt: 1,
          language: 'en',
          source: 'external-review',
          overallSummary: 'sum',
          keyIssues: ['i1'],
          feedback: makeFeedback(),
          patch: { subject: 's1' },
        },
        {
          id: 'm2',
          title: 'm2',
          createdAt: 2,
          language: 'en',
          source: 'external-review',
          overallSummary: 'sum',
          keyIssues: ['i1'],
          feedback: makeFeedback(),
          patch: { subject: 's2' },
        },
      ],
      activeMemoryIds: ['m1'],
      publishedVersions: [
        {
          id: 'p1',
          name: 'v1',
          createdAt: 1,
          memoryIds: ['m2'],
        },
      ],
      publishedVersionId: 'p1',
    };

    expect(resolveActiveMemoryIds(item)).toEqual(['m2']);
  });

  it('builds patch from feedback rewrites', () => {
    const patch = buildMemoryPatchFromFeedback(makeFeedback());
    expect(patch.subject).toBe('rewritten subject');
    expect(patch.style).toBe('rewritten style');
  });
});
