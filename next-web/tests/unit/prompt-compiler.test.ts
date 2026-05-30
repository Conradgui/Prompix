import { describe, expect, it } from 'vitest';
import { DimensionKey, PromptSegment } from '../../lib/types';
import { compilePromptSegment, compileFullPrompt } from '../../lib/utils/promptCompiler';

describe('compilePromptSegment', () => {
  it('omits formatting and weight if weight is 1.0', () => {
    expect(compilePromptSegment('a cute cat', 1.0, 'mj')).toBe('a cute cat');
    expect(compilePromptSegment('a cute cat', 1.0, 'sd')).toBe('a cute cat');
    expect(compilePromptSegment('a cute cat', 1.0, 'plain')).toBe('a cute cat');
  });

  it('formats weight correctly for Midjourney double colon syntax', () => {
    expect(compilePromptSegment('a cute cat', 1.5, 'mj')).toBe('a cute cat::1.5');
    expect(compilePromptSegment('a cute cat', 0.8, 'mj')).toBe('a cute cat::0.8');
  });

  it('formats weight correctly for Stable Diffusion parentheses syntax', () => {
    expect(compilePromptSegment('a cute cat', 1.5, 'sd')).toBe('(a cute cat:1.5)');
    expect(compilePromptSegment('a cute cat', 0.8, 'sd')).toBe('(a cute cat:0.8)');
  });

  it('returns empty string if input text is empty', () => {
    expect(compilePromptSegment('', 1.5, 'mj')).toBe('');
  });
});

describe('compileFullPrompt', () => {
  const enabledKeys: DimensionKey[] = ['subject', 'style'];
  const prompts: Record<string, PromptSegment> = {
    subject: { original: 'a cute cat', translated: '一只可爱的猫' },
    style: { original: 'cinematic style', translated: '电影感风格' },
  };

  it('compiles Midjourney formats and correctly omits default weights', () => {
    const weights: Record<string, number> = { subject: 1.0, style: 1.5 };
    const result = compileFullPrompt(
      enabledKeys,
      prompts,
      weights,
      'mj',
      ' --ar 16:9',
      'worst quality',
      (seg) => seg.original,
      (k) => k
    );
    expect(result).toBe('a cute cat, cinematic style::1.5 --ar 16:9');
  });

  it('compiles Stable Diffusion formats and correctly omits default weights', () => {
    const weights: Record<string, number> = { subject: 1.5, style: 1.0 };
    const result = compileFullPrompt(
      enabledKeys,
      prompts,
      weights,
      'sd',
      ' --ar 16:9',
      'worst quality',
      (seg) => seg.original,
      (k) => k
    );
    expect(result).toBe('【Positive Prompt】\n(a cute cat:1.5), cinematic style\n\n【Negative Prompt】\nworst quality');
  });

  it('compiles plain text format and ignore weights', () => {
    const weights: Record<string, number> = { subject: 1.5, style: 1.8 };
    const result = compileFullPrompt(
      enabledKeys,
      prompts,
      weights,
      'plain',
      ' --ar 16:9',
      'worst quality',
      (seg) => seg.original,
      (k) => k
    );
    expect(result).toBe('a cute cat\n\ncinematic style');
  });
});
