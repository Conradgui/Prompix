import { describe, expect, it } from 'vitest';
import {
  parseExternalReviewFeedbackFromText,
  validateExternalReviewFeedback,
} from '../../lib/utils/externalReview';
import { ExternalReviewFeedback } from '../../lib/types';

const validFeedback = (): ExternalReviewFeedback => ({
  version: 1,
  language: 'en',
  overallSummary: 'Need stronger composition hierarchy.',
  keyIssues: ['Subject focus is weak'],
  strategies: ['Increase foreground contrast'],
  dimensions: {
    subject: { score: 6, issues: 'Main subject is vague', rewrite: 'A sharp close-up portrait...', rationale: 'Improve subject clarity' },
    environment: { score: 7, issues: 'Context is generic', rewrite: 'Rainy neon city alley...', rationale: 'Add contextual anchors' },
    composition: { score: 5, issues: 'No leading lines', rewrite: 'Rule-of-thirds framing with diagonal lines...', rationale: 'Strengthen composition' },
    lighting: { score: 6, issues: 'Flat lighting', rewrite: 'Key light from top-left with rim light...', rationale: 'Create depth' },
    mood: { score: 7, issues: 'Emotion not explicit', rewrite: 'Tense cinematic mood...', rationale: 'Align affective tone' },
    style: { score: 8, issues: 'Style not specific', rewrite: 'Neo-noir film still style...', rationale: 'Increase style reproducibility' },
  },
});

describe('external review parser', () => {
  it('parses plain JSON text', () => {
    const raw = JSON.stringify(validFeedback());
    const result = parseExternalReviewFeedbackFromText(raw, 'zh');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.language).toBe('en');
      expect(result.data.dimensions.subject.rewrite).toContain('portrait');
    }
  });

  it('parses fenced code block JSON', () => {
    const raw = `Here is my result:\n\n\`\`\`json\n${JSON.stringify(validFeedback(), null, 2)}\n\`\`\``;
    const result = parseExternalReviewFeedbackFromText(raw, 'en');
    expect(result.ok).toBe(true);
  });

  it('rejects invalid shape', () => {
    const invalid = {
      version: 1,
      language: 'zh',
      overallSummary: 'x',
      keyIssues: ['x'],
      strategies: ['x'],
      dimensions: {
        subject: { score: 7, issues: '', rewrite: '', rationale: '' },
      },
    };
    const result = validateExternalReviewFeedback(invalid, 'zh');
    expect(result.ok).toBe(false);
  });
});
