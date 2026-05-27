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
import { getDimensionPrompt, getMasterAnalysisPrompt, getTranslationPrompt } from '../services/providers/masterPrompt';
import { buildVisionPrompt, callMiniMax, resolveMiniMaxConfig } from './minimax';
import { normalizeModelOutput, sanitizeThinkingText } from './model-output';
import { OpenAIServerProvider, ClaudeServerProvider, ServerProvider } from './provider-factory';

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
  return null;
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

const toManagedMeta = (thinkingText: string): ManagedMeta | undefined => {
  const thinking = sanitizeThinkingText(thinkingText || '');
  if (!thinking) return undefined;
  return { thinking };
};

interface ExplainTermParsed {
  def: string;
  app: string;
}

const parseExplainTerm = (text: string): ExplainTermParsed => {
  const parsed = safeParseJSON<Partial<ExplainTermParsed>>(text, { def: '', app: '' });
  return {
    def: String(parsed?.def || '').trim(),
    app: String(parsed?.app || '').trim(),
  };
};

const isExplainTermValid = (value: ExplainTermParsed): boolean => {
  return Boolean(value.def && value.app);
};

const buildExplainTermPrompt = (term: string, language: string, strict = false): string => {
  if (!strict) {
    return `你是一名资深视觉总监。请解释术语 "${term}"。\n目标语言：${language}\n仅输出 JSON：{"def":"...","app":"..."}。`;
  }

  return [
    `你是一名资深视觉总监，请解释术语 "${term}"。`,
    `目标语言：${language}。`,
    '必须只输出一个 JSON 对象，禁止输出任何额外文字、标签或代码块。',
    'JSON 结构固定为：{"def":"...","app":"..."}',
    '约束：',
    '1. def 与 app 均不能为空。',
    '2. def = 简洁定义；app = 在视觉创作中的具体应用方式。',
  ].join('\n');
};

export const analyzeWithMiniMax = async (
  image: string,
  settings: UserSettings,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ analysis: AnalysisResult; meta?: ManagedMeta }> => {
  const provider = getServerProvider(customConfig);
  if (provider) {
    const parsed = await provider.analyzeImage(image, settings);
    const analysis = normalizeAnalysis(parsed);
    return { analysis };
  }

  const config = resolveMiniMaxConfig(customConfig);
  const prompt = getMasterAnalysisPrompt(settings);
  const content = buildVisionPrompt(image, prompt);
  const text = await callMiniMax(config, [{ role: 'user', content }], { maxTokens: 2300 });
  const normalized = normalizeModelOutput(text);
  const parsed = safeParseJSON<AnalysisResult>(normalized.finalText, buildEmptyAnalysis());

  let analysis = normalizeAnalysis(parsed);
  if (!hasAnySegmentContent(analysis) && normalized.finalText) {
    const repaired = normalizeAnalysis({ description: normalized.finalText });
    if (hasAnySegmentContent(repaired)) {
      analysis = repaired;
    }
  }

  return {
    analysis,
    meta: toManagedMeta(normalized.thinkingText),
  };
};

export const regenerateWithMiniMax = async (
  image: string,
  dimension: DimensionKey,
  settings: UserSettings,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ segment: PromptSegment; meta?: ManagedMeta }> => {
  const provider = getServerProvider(customConfig);
  if (provider) {
    const segment = await provider.regenerateDimension(image, dimension, settings);
    return { segment };
  }

  const config = resolveMiniMaxConfig(customConfig);
  const system = getDimensionPrompt(dimension, settings);
  const content = buildVisionPrompt(image, '请严格遵循系统指令输出 JSON。');
  const text = await callMiniMax(config, [
    { role: 'system', content: system },
    { role: 'user', content },
  ], { maxTokens: 900 });
  const normalized = normalizeModelOutput(text);
  const parsed = safeParseJSON<PromptSegment>(normalized.finalText, emptySegment());
  return {
    segment: {
      original: parsed.original || '',
      translated: parsed.translated || '',
    },
    meta: toManagedMeta(normalized.thinkingText),
  };
};

export const explainTermWithMiniMax = async (
  term: string,
  language: string,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ explanation: { def: string; app: string }; meta?: ManagedMeta }> => {
  const provider = getServerProvider(customConfig);
  if (provider) {
    const explanation = await provider.explainTerm(term, language);
    return { explanation };
  }

  const config = resolveMiniMaxConfig(customConfig);
  const thoughts: string[] = [];

  const first = await callMiniMax(
    config,
    [{ role: 'user', content: buildExplainTermPrompt(term, language, false) }],
    { maxTokens: 700 },
  );
  const normalizedFirst = normalizeModelOutput(first);
  if (normalizedFirst.thinkingText) thoughts.push(normalizedFirst.thinkingText);
  let parsed = parseExplainTerm(normalizedFirst.finalText);

  if (!isExplainTermValid(parsed)) {
    const second = await callMiniMax(
      config,
      [{ role: 'user', content: buildExplainTermPrompt(term, language, true) }],
      { maxTokens: 700 },
    );
    const normalizedSecond = normalizeModelOutput(second);
    if (normalizedSecond.thinkingText) thoughts.push(normalizedSecond.thinkingText);
    parsed = parseExplainTerm(normalizedSecond.finalText);
  }

  if (!isExplainTermValid(parsed)) {
    throw new Error('术语解释暂时不可用，请稍后重试。');
  }

  return {
    explanation: parsed,
    meta: toManagedMeta(thoughts.join('\n\n')),
  };
};

export const translateWithMiniMax = async (
  text: string,
  language: string,
  customConfig?: Partial<ApiConfig> | null,
): Promise<{ translated: string; meta?: ManagedMeta }> => {
  const provider = getServerProvider(customConfig);
  if (provider) {
    const translated = await provider.translateText(text, language);
    return { translated };
  }

  const config = resolveMiniMaxConfig(customConfig);
  const prompt = getTranslationPrompt(text, language);
  const response = await callMiniMax(config, [{ role: 'user', content: prompt }], { maxTokens: 500 });
  const normalized = normalizeModelOutput(response);
  const parsed = safeParseJSON<{ translated: string }>(normalized.finalText, { translated: '' });
  return {
    translated: parsed.translated || '',
    meta: toManagedMeta(normalized.thinkingText),
  };
};

const mapHistory = (history: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> => {
  return history
    .slice(-12)
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text || '',
    }));
};

const buildSystemPrompt = (settings?: UserSettings): string => {
  return `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`;
};

const injectImageContext = (
  image: string | undefined,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> => {
  const next: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (!image) return messages;

  next.push({
    role: 'user',
    content: buildVisionPrompt(image, '这是当前对话参考图片。请基于它回答后续问题。'),
  });

  return [...next, ...messages];
};

export const chatWithMiniMax = async (params: {
  history: ChatMessage[];
  message: string;
  image?: string;
  settings?: UserSettings;
  customConfig?: Partial<ApiConfig> | null;
}): Promise<{ text: string; meta?: ManagedMeta }> => {
  const provider = getServerProvider(params.customConfig);
  if (provider) {
    const chatResult = await provider.chat(params.history, params.message, params.image, params.settings);
    return { text: chatResult.text };
  }

  const config = resolveMiniMaxConfig(params.customConfig);
  const messages = mapHistory(params.history);
  const withImage = injectImageContext(params.image, messages);

  const result = await callMiniMax(config, [
    { role: 'system', content: buildSystemPrompt(params.settings) },
    ...withImage,
    { role: 'user', content: params.message },
  ], { maxTokens: 1800 });

  const normalized = normalizeModelOutput(result);
  return {
    text: normalized.finalText,
    meta: toManagedMeta(normalized.thinkingText),
  };
};

const mapTermFollowupHistory = (
  history: TermFollowupMessage[],
): Array<{ role: 'user' | 'assistant'; content: string }> => {
  return history
    .slice(-16)
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.text || '',
    }));
};

const buildTermFollowupSystemPrompt = (params: {
  term: string;
  language: string;
  definition: string;
  application: string;
  thinking?: string;
}): string => {
  return [
    '你是 Prompix 术语学习助手。',
    `目标语言：${params.language || 'Chinese'}。`,
    `当前术语：${params.term}。`,
    `术语定义：${params.definition || '（暂无）'}。`,
    `术语应用：${params.application || '（暂无）'}。`,
    params.thinking ? `模型思考摘录：${params.thinking}` : '',
    '回答要求：',
    '1. 简洁、专业、可执行，不重复模板句。',
    '2. 优先回答用户追问，并给出可直接落地的表达建议。',
  ]
    .filter(Boolean)
    .join('\n');
};

export const termFollowupWithMiniMax = async (params: {
  term: string;
  language: string;
  definition: string;
  application: string;
  thinking?: string;
  history: TermFollowupMessage[];
  message: string;
  customConfig?: Partial<ApiConfig> | null;
}): Promise<{ text: string; meta?: ManagedMeta }> => {
  const config = resolveMiniMaxConfig(params.customConfig);
  const history = mapTermFollowupHistory(params.history || []);
  const system = buildTermFollowupSystemPrompt(params);
  const response = await callMiniMax(config, [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: params.message },
  ], { maxTokens: 1000 });

  const normalized = normalizeModelOutput(response);
  return {
    text: normalized.finalText,
    meta: toManagedMeta(normalized.thinkingText),
  };
};
