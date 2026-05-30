import {
  AnalysisResult,
  ApiConfig,
  ChatMessage,
  DimensionKey,
  ManagedMeta,
  PromptSegment,
  TermFollowupMessage,
  UserSettings,
} from '../types';
import { safeParseJSON } from '../utils/jsonParser';
import {
  OpenAIServerProvider,
  ClaudeServerProvider,
  GeminiServerProvider,
  ServerProvider,
} from './provider-factory';

const cleanServerConfig = (cfg: Partial<ApiConfig>): ApiConfig => {
  let baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  if (baseUrl.includes('xiaomimimo.com') && !baseUrl.endsWith('/v1')) {
    baseUrl = `${baseUrl}/v1`;
  }
  let model = (cfg.model || 'gpt-4o-mini').trim();
  if (baseUrl.includes('xiaomimimo.com') || model.toLowerCase().startsWith('mimo')) {
    model = model.toLowerCase();
  }
  return {
    providerLabel: (cfg.providerLabel || 'OpenAI Compatible').trim(),
    baseUrl,
    apiKey: (cfg.apiKey || '').trim(),
    model,
    groupId: (cfg.groupId || '').trim(),
    provider: (cfg.provider || 'openai').trim(),
  };
};

export const getServerProvider = (customConfig?: Partial<ApiConfig> | null): ServerProvider | null => {
  if (!customConfig || !customConfig.apiKey) {
    return null;
  }
  const custom = cleanServerConfig(customConfig);
  const provider = (custom.provider || 'openai').toLowerCase();

  if (provider === 'openai' || provider === 'siliconflow') {
    return new OpenAIServerProvider(custom);
  }
  if (provider === 'claude') {
    return new ClaudeServerProvider(custom);
  }
  if (provider === 'gemini') {
    return new GeminiServerProvider(custom);
  }
  return null;
};

export const getManagedProvider = (customConfig?: Partial<ApiConfig> | null): ServerProvider => {
  const provider = getServerProvider(customConfig);
  if (provider) return provider;

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (apiKey) {
    return new GeminiServerProvider({
      provider: 'gemini',
      apiKey,
      model: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
      baseUrl: '',
      providerLabel: 'Gemini',
      groupId: '',
    });
  }

  throw new Error('MANAGED_PROVIDER_NOT_CONFIGURED');
};

const emptySegment = (): PromptSegment => ({ original: '', translated: '' });

const buildEmptyAnalysis = (): AnalysisResult => ({
  description: '',
  structuredPrompts: {
    subject: emptySegment(),
    environment: emptySegment(),
    composition: emptySegment(),
    lighting: emptySegment(),
    mood: emptySegment(),
    style: emptySegment(),
  },
});

const DIMENSION_KEYS: DimensionKey[] = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'];
const DIMENSION_LABELS: Record<DimensionKey, string[]> = {
  subject: ['subject', '主体'],
  environment: ['environment', '环境'],
  composition: ['composition', '构图'],
  lighting: ['lighting', '光照'],
  mood: ['mood', '情绪'],
  style: ['style', '风格'],
};

const toText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return '';
};

const cleanSegmentText = (value: string): string => {
  return (value || '')
    .replace(/^\s*[-*•]\s*/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
};

const normalizeSegment = (value: unknown): PromptSegment => {
  if (!value) return emptySegment();
  if (typeof value === 'string') {
    return { original: cleanSegmentText(value), translated: '' };
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join(', ');
    return { original: cleanSegmentText(joined), translated: '' };
  }

  if (typeof value !== 'object') return emptySegment();

  const source = value as Record<string, unknown>;
  const original = firstNonEmpty(
    source.original,
    source.prompt,
    source.text,
    source.content,
    source.value,
    source.main,
    source.description,
    source.zh,
    source.en,
    Array.isArray(source.tags) ? source.tags.join(', ') : '',
    Array.isArray(source.keywords) ? source.keywords.join(', ') : '',
  );
  const translated = firstNonEmpty(
    source.translated,
    source.translation,
    source.trans,
    source.localized,
  );

  return {
    original: cleanSegmentText(original || translated),
    translated: cleanSegmentText(translated),
  };
};

const findDimensionInArray = (input: unknown, key: DimensionKey): unknown => {
  if (!Array.isArray(input)) return undefined;
  const aliases = DIMENSION_LABELS[key];

  return input.find((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const row = entry as Record<string, unknown>;
    const name = String(
      row.key || row.dimension || row.name || row.label || row.type || '',
    )
      .trim()
      .toLowerCase();
    return aliases.some((alias) => name === alias.toLowerCase());
  });
};

const getDimensionRaw = (raw: Record<string, any>, key: DimensionKey): unknown => {
  const containers: unknown[] = [
    raw.structuredPrompts,
    raw.structured_prompts,
    raw.prompts,
    raw.sections,
    raw.modules,
  ];

  const aliases = DIMENSION_LABELS[key];
  const keyCandidates = [
    key,
    key.toUpperCase(),
    key[0].toUpperCase() + key.slice(1),
    ...aliases,
    `${key}Prompt`,
    `${key}_prompt`,
  ];

  for (const container of containers) {
    if (!container) continue;
    if (Array.isArray(container)) {
      const hit = findDimensionInArray(container, key);
      if (hit) {
        const row = hit as Record<string, unknown>;
        return row.value ?? row.segment ?? row.prompt ?? row.text ?? row.content ?? row;
      }
      continue;
    }

    if (typeof container === 'object') {
      const obj = container as Record<string, unknown>;
      for (const candidate of keyCandidates) {
        if (obj[candidate] !== undefined) return obj[candidate];
      }
    }
  }

  for (const candidate of keyCandidates) {
    if (raw[candidate] !== undefined) return raw[candidate];
  }
  return undefined;
};

const extractDimensionFromDescription = (description: string, key: DimensionKey): string => {
  const text = (description || '').trim();
  if (!text) return '';

  const currentAliases = DIMENSION_LABELS[key].join('|');
  const allAliases = Object.values(DIMENSION_LABELS).flat().join('|');
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${currentAliases})\\s*[:：]\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${allAliases})\\s*[:：])|$)`,
    'i',
  );

  const matched = text.match(pattern);
  if (!matched?.[1]) return '';
  return cleanSegmentText(matched[1]);
};

const hasAnySegmentContent = (analysis: AnalysisResult): boolean => {
  return DIMENSION_KEYS.some((key) => Boolean(analysis.structuredPrompts[key].original.trim()));
};

const normalizeAnalysis = (raw: Partial<AnalysisResult> | Record<string, any>): AnalysisResult => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const description = firstNonEmpty(source.description, source.summary, source.caption, source.overview);

  const normalizeDimension = (key: DimensionKey): PromptSegment => {
    const parsed = normalizeSegment(getDimensionRaw(source, key));
    if (parsed.original) return parsed;

    const fromDescription = extractDimensionFromDescription(description, key);
    if (!fromDescription) return parsed;
    return {
      ...parsed,
      original: fromDescription,
    };
  };

  return {
    description: cleanSegmentText(description),
    structuredPrompts: {
      subject: normalizeDimension('subject'),
      environment: normalizeDimension('environment'),
      composition: normalizeDimension('composition'),
      lighting: normalizeDimension('lighting'),
      mood: normalizeDimension('mood'),
      style: normalizeDimension('style'),
    },
  };
};

export const analyzeWithProvider = async (
  image: string,
  settings: UserSettings,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ analysis: AnalysisResult; meta?: ManagedMeta }> => {
  const provider = getManagedProvider(customConfig);
  const parsed = await provider.analyzeImage(image, settings);
  const analysis = normalizeAnalysis(parsed);
  return { analysis };
};

export const regenerateWithProvider = async (
  image: string,
  dimension: DimensionKey,
  settings: UserSettings,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ segment: PromptSegment; meta?: ManagedMeta }> => {
  const provider = getManagedProvider(customConfig);
  const segment = await provider.regenerateDimension(image, dimension, settings);
  return { segment };
};

export const explainTermWithProvider = async (
  term: string,
  language: string,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ explanation: { def: string; app: string }; meta?: ManagedMeta }> => {
  const provider = getManagedProvider(customConfig);
  const explanation = await provider.explainTerm(term, language);
  return { explanation };
};

export const translateWithProvider = async (
  text: string,
  language: string,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ translated: string; meta?: ManagedMeta }> => {
  const provider = getManagedProvider(customConfig);
  const translated = await provider.translateText(text, language);
  return { translated };
};

export const chatWithProvider = async (params: {
  history: ChatMessage[];
  message: string;
  image?: string;
  settings?: UserSettings;
  customConfig?: Partial<ApiConfig> | null;
}): Promise<{ text: string; meta?: ManagedMeta }> => {
  const provider = getManagedProvider(params.customConfig);
  const chatResult = await provider.chat(params.history, params.message, params.image, params.settings);
  return { text: chatResult.text };
};

export const termFollowupWithProvider = async (params: {
  term: string;
  language: string;
  definition: string;
  application: string;
  thinking?: string;
  history: TermFollowupMessage[];
  message: string;
  customConfig?: Partial<ApiConfig> | null;
}): Promise<{ text: string; meta?: ManagedMeta }> => {
  const provider = getManagedProvider(params.customConfig);
  const result = await provider.termFollowup({
    term: params.term,
    language: params.language,
    definition: params.definition,
    application: params.application,
    thinking: params.thinking,
    history: params.history,
    message: params.message,
  });
  return { text: result.text };
};
