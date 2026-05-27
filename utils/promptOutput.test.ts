import { applyPromptOutputLanguage } from './promptOutput';
import { DEFAULT_SETTINGS } from '../types';

describe('applyPromptOutputLanguage', () => {
  it('maps zh to Chinese front and English back', () => {
    const next = applyPromptOutputLanguage(DEFAULT_SETTINGS, 'zh');
    expect(next.promptOutputLanguage).toBe('zh');
    expect(next.cardFrontLanguage).toBe('Chinese');
    expect(next.cardBackLanguage).toBe('English');
  });

  it('maps en to English front and Chinese back', () => {
    const next = applyPromptOutputLanguage(DEFAULT_SETTINGS, 'en');
    expect(next.promptOutputLanguage).toBe('en');
    expect(next.cardFrontLanguage).toBe('English');
    expect(next.cardBackLanguage).toBe('Chinese');
  });
});
