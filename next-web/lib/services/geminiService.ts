// ============================================
// Unified AI Service - Runtime Mode (demo/api)
// demo: 平台直连（服务端托管 Key）
// api:  自定义 Key（经服务端转发）
// ============================================

import {
  AnalysisResult,
  UserSettings,
  ChatMessage,
  HistoryItem,
  DimensionKey,
  PromptSegment,
  ManagedMeta,
  TermFollowupMessage,
} from '../types';
import { getApiConfig, getCurrentModel, getRuntimeMode, isApiConfigReady } from './providers';

export interface TermExplanation {
  def: string;
  app: string;
}

export interface TermFollowupResponse {
  text: string;
  meta?: ManagedMeta;
}

type MetaHandler = (meta?: ManagedMeta) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isChinese = (lang?: string): boolean => {
  const v = (lang || '').toLowerCase();
  return v.includes('chinese') || v.includes('中文') || v.startsWith('zh');
};

const getRuntimePayload = () => {
  const mode = getRuntimeMode();
  if (mode !== 'api') return { mode };

  const apiConfig = getApiConfig();
  if (!isApiConfigReady(apiConfig)) {
    throw new Error('MISSING_API_KEY');
  }
  return {
    mode,
    apiConfig,
  };
};

const requestManaged = async <T>(path: string, payload: Record<string, unknown>): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data as T;
};

export const analyzeImage = async (
  base64Image: string,
  settings: UserSettings,
  onMeta?: MetaHandler,
): Promise<AnalysisResult> => {
  const runtimePayload = getRuntimePayload();
  const data = await requestManaged<{ analysis: AnalysisResult; meta?: ManagedMeta }>('/api/managed/analyze', {
    image: base64Image,
    settings,
    ...runtimePayload,
  });
  onMeta?.(data.meta);
  return data.analysis;
};

export const searchHistory = async (query: string, history: HistoryItem[]): Promise<string[]> => {
  if (!query.trim() || !history.length) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const extractItemText = (item: HistoryItem): string => {
    const sp = item.analysis.structuredPrompts;
    const dimensions = [
      sp?.subject?.original || '',
      sp?.subject?.translated || '',
      sp?.environment?.original || '',
      sp?.environment?.translated || '',
      sp?.composition?.original || '',
      sp?.composition?.translated || '',
      sp?.lighting?.original || '',
      sp?.lighting?.translated || '',
      sp?.mood?.original || '',
      sp?.mood?.translated || '',
      sp?.style?.original || '',
      sp?.style?.translated || '',
    ].filter(Boolean);
    return ((item.analysis.description || '') + ' ' + dimensions.join(' ')).toLowerCase();
  };

  return history
    .filter((item) => {
      const text = extractItemText(item);
      return terms.every((term) => text.includes(term));
    })
    .map((item) => item.id);
};

export const sendChatMessageStream = async (
  history: ChatMessage[],
  message: string,
  image: string | undefined,
  onUpdate: (text: string) => void,
  settings?: UserSettings,
  onMeta?: MetaHandler,
): Promise<void> => {
  let accumulated = '';
  try {
    const runtimePayload = getRuntimePayload();
    const response = await fetch('/api/managed/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        history,
        message,
        image,
        settings,
        ...runtimePayload,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error || `Request failed (${response.status})`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          onUpdate(accumulated);
        }
      } catch (streamErr: any) {
        throw new Error(`Stream read error: ${streamErr?.message || String(streamErr)}`);
      } finally {
        reader.releaseLock();
      }
    }
  } catch (error: any) {
    if (error?.message === 'MISSING_API_KEY') {
      onUpdate(isChinese(settings?.systemLanguage) ? '请先在设置中填写 API Key。' : 'Please configure API key in settings.');
      return;
    }
    const errText = error?.message || (isChinese(settings?.systemLanguage) ? '网络连接超时或服务商接口无响应。' : 'Network timeout or provider API no response.');
    if (accumulated) {
      const suffix = isChinese(settings?.systemLanguage)
        ? `\n\n[连接异常中断: ${errText}]`
        : `\n\n[Connection interrupted: ${errText}]`;
      onUpdate(accumulated + suffix);
    } else {
      const prefix = isChinese(settings?.systemLanguage)
        ? `对话失败，请检查服务商 API Key 和 Base URL 设置。\n错误详情: `
        : `Dialogue failed, please check your API Key and Base URL settings.\nError details: `;
      onUpdate(prefix + errText);
    }
  }
};

export const regenerateDimension = async (
  base64Image: string,
  dimension: DimensionKey,
  settings: UserSettings,
  onMeta?: MetaHandler,
): Promise<PromptSegment> => {
  const runtimePayload = getRuntimePayload();
  const data = await requestManaged<{ segment: PromptSegment; meta?: ManagedMeta }>('/api/managed/regenerate', {
    image: base64Image,
    dimension,
    settings,
    ...runtimePayload,
  });
  onMeta?.(data.meta);
  return data.segment;
};

export const explainVisualTerm = async (
  term: string,
  language: string,
  onMeta?: MetaHandler,
): Promise<TermExplanation> => {
  const runtimePayload = getRuntimePayload();
  const data = await requestManaged<{ explanation: TermExplanation; meta?: ManagedMeta }>('/api/managed/explain-term', {
    term,
    language,
    ...runtimePayload,
  });
  onMeta?.(data.meta);
  return data.explanation;
};

export const translateText = async (
  text: string,
  language: string,
  onMeta?: MetaHandler,
): Promise<string> => {
  try {
    const runtimePayload = getRuntimePayload();
    const data = await requestManaged<{ translated: string; meta?: ManagedMeta }>('/api/managed/translate', {
      text,
      language,
      ...runtimePayload,
    });
    onMeta?.(data.meta);
    return data.translated || '';
  } catch {
    return '';
  }
};

export const askTermFollowUp = async (params: {
  term: string;
  language: string;
  definition: string;
  application: string;
  thinking?: string;
  history: TermFollowupMessage[];
  message: string;
  onMeta?: MetaHandler;
}): Promise<string> => {
  const runtimePayload = getRuntimePayload();
  const data = await requestManaged<TermFollowupResponse>('/api/managed/term-followup', {
    term: params.term,
    language: params.language,
    definition: params.definition,
    application: params.application,
    thinking: params.thinking,
    history: params.history,
    message: params.message,
    ...runtimePayload,
  });
  params.onMeta?.(data.meta);
  return data.text || '';
};

export const getActiveProviderInfo = () => {
  return {
    runtimeMode: getRuntimeMode(),
    provider: 'minimax',
    model: getCurrentModel(),
  };
};
