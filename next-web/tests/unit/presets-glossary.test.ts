import { describe, expect, it } from 'vitest';
import presetsGlossary from '../../lib/data/presets-glossary.json';

describe('presets-glossary static dictionary', () => {
  it('contains valid visual terms, all mapped to standard def and app values', () => {
    const terms = Object.keys(presetsGlossary);
    expect(terms.length).toBeGreaterThan(0);

    for (const term of terms) {
      const entry = (presetsGlossary as Record<string, { def: string; app: string }>)[term];
      expect(entry).toBeDefined();
      expect(typeof entry.def).toBe('string');
      expect(typeof entry.app).toBe('string');
      expect(entry.def.length).toBeGreaterThan(10);
      expect(entry.app.length).toBeGreaterThan(10);
    }
  });

  it('ensures keys are stored in lowercase for safe lookup matching', () => {
    const terms = Object.keys(presetsGlossary);
    for (const term of terms) {
      expect(term).toBe(term.toLowerCase());
    }
  });

  it('contains core default visual terms', () => {
    const dict = presetsGlossary as Record<string, { def: string; app: string }>;
    expect(dict.cyberpunk).toBeDefined();
    expect(dict.vaporwave).toBeDefined();
    expect(dict.chiaroscuro).toBeDefined();
    expect(dict.bokeh).toBeDefined();
    expect(dict.wlop).toBeDefined();
  });
});
