import { DEFAULT_SETTINGS } from '../types';
import { analyzeImage } from './geminiService';
import { setApiConfig, setRuntimeMode } from './providers';

describe('geminiService runtime mode guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns demo result in demo mode without api key', async () => {
    setRuntimeMode('demo');
    const result = await analyzeImage('data:image/jpeg;base64,demo', DEFAULT_SETTINGS);
    expect(result.structuredPrompts.subject.original.length).toBeGreaterThan(0);
  });

  it('throws missing key in api mode if config is incomplete', async () => {
    setRuntimeMode('api');
    setApiConfig({ apiKey: '' });

    await expect(analyzeImage('data:image/jpeg;base64,demo', DEFAULT_SETTINGS)).rejects.toThrow('MISSING_API_KEY');
  });
});
