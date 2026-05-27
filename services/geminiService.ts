// ============================================
// Unified AI Service - Runtime Mode (demo/api)
// ============================================

import { AnalysisResult, UserSettings, ChatMessage, HistoryItem, DimensionKey, PromptSegment } from "../types";
import {
  getProvider,
  TermExplanation,
  getApiConfig,
  getCurrentProvider,
  getCurrentModel,
  getRuntimeMode,
  isApiConfigReady,
} from "./providers";

export type { TermExplanation } from "./providers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isChinese = (lang?: string): boolean => {
  const v = (lang || '').toLowerCase();
  return v.includes('chinese') || v.includes('中文') || v.startsWith('zh');
};

const buildSegment = (settings: UserSettings, en: string, zh: string): PromptSegment => {
  const frontIsZh = isChinese(settings.cardFrontLanguage);
  return frontIsZh
    ? { original: zh, translated: en }
    : { original: en, translated: zh };
};

const buildDemoAnalysis = (settings: UserSettings): AnalysisResult => {
  return {
    description: isChinese(settings.systemLanguage)
      ? '这是 Demo 模式下的示例解析结果。你可以直接体验完整流程（分析、聊天、历史、导出），切换到“自定义API”即可获得真实模型输出。'
      : 'This is a demo analysis result for offline preview. Switch to API mode for real model output.',
    structuredPrompts: {
      subject: buildSegment(settings,
        'young designer, focused expression, holding a sketchbook, half-body portrait, center framing',
        '年轻设计师，专注神情，手持速写本，半身构图，居中主体'),
      environment: buildSegment(settings,
        'modern creative studio, warm daylight from side window, clean desk with tools and notes',
        '现代创意工作室，侧窗暖色日光，桌面整洁并摆放设计工具与便签'),
      composition: buildSegment(settings,
        'medium shot, eye-level, rule of thirds, shallow depth of field, clean negative space',
        '中景，平视角，三分法构图，浅景深，留白干净'),
      lighting: buildSegment(settings,
        'soft side lighting, warm color temperature, subtle rim light, natural contrast',
        '柔和侧光，暖色温，轻微轮廓光，自然对比度'),
      mood: buildSegment(settings,
        'focused, optimistic, productive, contemporary, calm',
        '专注，积极，高效，当代感，平静'),
      style: buildSegment(settings,
        'editorial photography, minimalism, lifestyle branding visual, clean texture',
        '编辑感摄影，极简风，生活方式品牌视觉，质感干净'),
    },
  };
};

const buildDemoTermExplanation = (term: string, language: string): TermExplanation => {
  const zh = isChinese(language);
  if (zh) {
    return {
      def: `${term}：用于描述画面中可复用的视觉特征与风格信息。`,
      app: '适用于提示词拆解、风格复刻、视觉一致性控制。',
    };
  }
  return {
    def: `${term}: a reusable visual descriptor used for prompt engineering and style control.`,
    app: 'Useful for prompt decomposition, style transfer, and visual consistency.',
  };
};

const buildDemoChatReply = (message: string, language?: string): string => {
  if (isChinese(language)) {
    return `Demo 回复：我已收到你的问题「${message}」。当前为免费试用模式，结果为本地示例。切换到“自定义API”并配置 Key 后可获取真实分析。`;
  }
  return `Demo reply: received your question "${message}". You are in trial mode with local mock output. Switch to API mode for real analysis.`;
};

const assertApiReady = () => {
  const config = getApiConfig();
  if (!isApiConfigReady(config)) {
    throw new Error("MISSING_API_KEY");
  }
};

export const analyzeImage = async (
  base64Image: string,
  settings: UserSettings
): Promise<AnalysisResult> => {
  const runtimeMode = getRuntimeMode();

  if (runtimeMode === 'demo') {
    await sleep(500);
    return buildDemoAnalysis(settings);
  }

  assertApiReady();

  try {
    const provider = getProvider();
    return await provider.analyzeImage(base64Image, settings);
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
};

export const searchHistory = async (query: string, history: HistoryItem[]): Promise<string[]> => {
  if (!query.trim() || !history.length) return [];

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

    return ((item.analysis.description || "") + " " + dimensions.join(" ")).toLowerCase();
  };

  const runtimeMode = getRuntimeMode();
  if (runtimeMode === 'demo') {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return history.filter((item) => {
      const text = extractItemText(item);
      return terms.every((term) => text.includes(term));
    }).map((h) => h.id);
  }

  try {
    const provider = getProvider();
    const conceptGroups = await provider.expandSearchQuery(query);

    if (conceptGroups.length === 0) throw new Error('No concepts found');

    return history.filter(item => {
      const itemText = extractItemText(item);
      return conceptGroups.every(group => group.some(word => itemText.includes(word.toLowerCase())));
    }).map(h => h.id);
  } catch (e) {
    console.warn('Semantic search expansion failed, fallback to strict matching.', e);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return history.filter(item => {
      const itemText = extractItemText(item);
      return terms.every(term => itemText.includes(term));
    }).map(h => h.id);
  }
};

export const sendChatMessageStream = async (
  history: ChatMessage[],
  message: string,
  image: string | undefined,
  onUpdate: (text: string) => void,
  settings?: UserSettings
): Promise<void> => {
  const runtimeMode = getRuntimeMode();

  if (runtimeMode === 'demo') {
    const full = buildDemoChatReply(message, settings?.systemLanguage);
    let output = '';
    for (const ch of full) {
      output += ch;
      onUpdate(output);
      // 短延时模拟流式
      // eslint-disable-next-line no-await-in-loop
      await sleep(12);
    }
    return;
  }

  try {
    assertApiReady();
    const provider = getProvider();
    await provider.chatStream(history, message, image, onUpdate, settings);
  } catch (e: any) {
    console.error('Chat stream error:', e);
    if (e.message === 'MISSING_API_KEY') {
      onUpdate(isChinese(settings?.systemLanguage) ? '请先在设置中填写 API Key。' : 'Please configure API Key in settings.');
    } else {
      onUpdate(isChinese(settings?.systemLanguage) ? '连接失败，请检查 API 配置或网络。' : 'Connection failed. Check API settings/network.');
    }
  }
};

export const regenerateDimension = async (
  base64Image: string,
  dimension: DimensionKey,
  settings: UserSettings
): Promise<PromptSegment> => {
  const runtimeMode = getRuntimeMode();

  if (runtimeMode === 'demo') {
    await sleep(300);
    const seed = new Date().toLocaleTimeString();
    const en = `demo regenerated ${dimension}, refined detail, version ${seed}`;
    const zh = `Demo 已刷新 ${dimension}，细节增强，版本 ${seed}`;
    return buildSegment(settings, en, zh);
  }

  try {
    assertApiReady();
    const provider = getProvider();
    return await provider.regenerateDimension(base64Image, dimension, settings);
  } catch (error) {
    console.error(`Regeneration failed for ${dimension}:`, error);
    throw error;
  }
};

export const explainVisualTerm = async (term: string, language: string): Promise<TermExplanation> => {
  const runtimeMode = getRuntimeMode();

  if (runtimeMode === 'demo') {
    await sleep(200);
    return buildDemoTermExplanation(term, language);
  }

  try {
    assertApiReady();
    const provider = getProvider();
    return await provider.explainTerm(term, language);
  } catch (error) {
    console.error('Explain term failed:', error);
    const msg = (error as any)?.message || String(error);
    return {
      def: msg.includes('MISSING_API_KEY')
        ? (isChinese(language) ? 'API Key 缺失' : 'Missing API Key')
        : `Error: ${msg.slice(0, 40)}`,
      app: msg.includes('MISSING_API_KEY')
        ? (isChinese(language) ? '请在设置中配置' : 'Check settings')
        : (isChinese(language) ? '请查看控制台日志' : 'Check console logs'),
    };
  }
};

export const translateText = async (text: string, language: string): Promise<string> => {
  const runtimeMode = getRuntimeMode();

  if (runtimeMode === 'demo') {
    return isChinese(language)
      ? `【Demo 翻译】${text}`
      : `[Demo translation] ${text}`;
  }

  try {
    assertApiReady();
    const provider = getProvider();
    return await provider.translateText(text, language);
  } catch (error) {
    console.error('Translation failed:', error);
    return '';
  }
};

export const getActiveProviderInfo = () => {
  return {
    runtimeMode: getRuntimeMode(),
    provider: getCurrentProvider(),
    model: getCurrentModel(),
  };
};
