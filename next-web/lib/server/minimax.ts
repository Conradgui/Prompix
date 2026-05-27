import { ApiConfig } from '../types';

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.MINIMAX_MODEL?.trim() || 'MiniMax-M2.5';

export interface ResolvedMiniMaxConfig {
  baseUrl: string;
  apiKey: string;
  groupId: string;
  model: string;
  source: 'managed' | 'custom';
}

export interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const normalizeBaseUrl = (value?: string): string => {
  const raw = (value || DEFAULT_BASE_URL).trim();
  if (!raw) return DEFAULT_BASE_URL;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const stripDataUrlPrefix = (input: string): string => {
  if (!input) return '';
  const idx = input.indexOf('base64,');
  if (idx === -1) return input.trim();
  return input.slice(idx + 'base64,'.length).trim();
};

export const buildVisionPrompt = (base64Image: string, prompt: string): string => {
  const raw = stripDataUrlPrefix(base64Image);
  return `${prompt}\n\n[图片base64:${raw}]`;
};

export const resolveMiniMaxConfig = (custom?: Partial<ApiConfig> | null): ResolvedMiniMaxConfig => {
  const customApiKey = (custom?.apiKey || '').trim();
  const customGroupId = (custom?.groupId || '').trim();

  if (customApiKey && customGroupId) {
    return {
      source: 'custom',
      apiKey: customApiKey,
      groupId: customGroupId,
      model: (custom?.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      baseUrl: normalizeBaseUrl(custom?.baseUrl),
    };
  }

  const managedApiKey = (process.env.MINIMAX_API_KEY || '').trim();
  const managedGroupId = (process.env.MINIMAX_GROUP_ID || '').trim();
  if (!managedApiKey || !managedGroupId) {
    throw new Error('MANAGED_PROVIDER_NOT_CONFIGURED');
  }

  return {
    source: 'managed',
    apiKey: managedApiKey,
    groupId: managedGroupId,
    model: DEFAULT_MODEL,
    baseUrl: normalizeBaseUrl(process.env.MINIMAX_BASE_URL),
  };
};

const toUrlWithGroupId = (baseUrl: string, groupId: string): string => {
  const url = new URL(baseUrl);
  url.searchParams.set('GroupId', groupId);
  return url.toString();
};

const extractMessageText = (data: any): string => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && typeof content?.text === 'string') {
    return content.text;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join('');
  }
  const choiceText = data?.choices?.[0]?.text;
  if (typeof choiceText === 'string') return choiceText;
  if (typeof data?.reply === 'string') return data.reply;
  return '';
};

const mapUpstreamError = (status: number, message: string): string => {
  const text = (message || '').toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    text.includes('invalid api key') ||
    text.includes('invalid token') ||
    text.includes('unauthorized') ||
    text.includes('auth')
  ) {
    return '鉴权失败，请检查 API Key 或分组 ID。';
  }
  if (status === 429) return '请求过于频繁，请稍后重试。';
  if (text.includes('insufficient') || text.includes('balance') || text.includes('quota')) {
    return '账户余额或额度不足，请检查 MiniMax 账户。';
  }
  return message || `MiniMax 请求失败（${status}）`;
};

const getBusinessErrorMessage = (data: any): string => {
  const statusCode = Number(data?.base_resp?.status_code ?? 0);
  if (!Number.isFinite(statusCode) || statusCode === 0) return '';
  return String(data?.base_resp?.status_msg || `MiniMax 业务错误（${statusCode}）`);
};

export const callMiniMax = async (
  config: ResolvedMiniMaxConfig,
  messages: MiniMaxMessage[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> => {
  const url = toUrlWithGroupId(config.baseUrl, config.groupId);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 4000,
    }),
  });

  const data = await response.json().catch(() => ({}));
  const businessError = getBusinessErrorMessage(data);
  if (!response.ok || businessError) {
    const message = businessError || data?.base_resp?.status_msg || data?.error?.message || '';
    const status = response.ok ? 400 : response.status;
    throw new Error(mapUpstreamError(status, message));
  }
  const text = extractMessageText(data);
  if (!text) {
    throw new Error('模型未返回有效内容，请稍后重试。');
  }
  return text;
};
