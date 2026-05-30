import { AnalysisResult, UserSettings, ChatMessage, PromptSegment, DimensionKey, ApiConfig, TermExplanation } from '../types';
import { safeParseJSON } from '../utils/jsonParser';
import { getDimensionPrompt, getMasterAnalysisPrompt, getTranslationPrompt } from '../services/providers/masterPrompt';
import { GoogleGenAI, Type } from '@google/genai';

export const buildTermFollowupSystemPrompt = (params: {
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

export interface ServerProvider {
  readonly name: string;
  analyzeImage(base64Image: string, settings: UserSettings): Promise<AnalysisResult>;
  regenerateDimension(base64Image: string, dimension: DimensionKey, settings: UserSettings): Promise<PromptSegment>;
  explainTerm(term: string, language: string): Promise<TermExplanation>;
  translateText(text: string, language: string): Promise<string>;
  chat(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<{ text: string }>;
  chatStream(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<ReadableStream>;
  termFollowup(params: {
    term: string;
    language: string;
    definition: string;
    application: string;
    thinking?: string;
    history: any[];
    message: string;
  }): Promise<{ text: string }>;
}

// ----------------------------------------------------
// Helper: Convert Base64 image to OpenAI image_url format
// ----------------------------------------------------
const toOpenAiImageUrl = (base64Image: string): string => {
  if (!base64Image) return '';
  if (base64Image.startsWith('data:image/')) return base64Image;
  // Fallback to jpeg if no prefix
  return `data:image/jpeg;base64,${base64Image.replace(/^data:image\/[a-z]+;base64,/, '')}`;
};

// ----------------------------------------------------
// Helper: Common text stream creator for server SSE response
// ----------------------------------------------------
export function createUnpackedTextStream(response: Response, parseChunk: (line: string) => string): ReadableStream {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      if (!reader) {
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            const parsed = parseChunk(cleanLine);
            if (parsed) {
              controller.enqueue(new TextEncoder().encode(parsed));
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    }
  });
}

// ====================================================
// 1. OpenAI Compatible Server Provider
// ====================================================
export class OpenAIServerProvider implements ServerProvider {
  readonly name = 'openai';
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private getUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  private getModelName(hasImage: boolean): string {
    const model = (this.config.model || '').trim();
    const modelLower = model.toLowerCase();

    if (hasImage) {
      // 1. Xiaomi MiMo fallback
      if (modelLower === 'mimo-v2.5-pro') {
        return 'mimo-v2.5';
      }
      // 2. SiliconFlow fallback to Qwen2.5-VL 72B
      if (
        modelLower.includes('deepseek-ai/deepseek-v3') ||
        modelLower.includes('deepseek-ai/deepseek-r1') ||
        modelLower === 'deepseek-v3' ||
        modelLower === 'deepseek-r1'
      ) {
        return 'Qwen/Qwen2.5-VL-72B-Instruct';
      }
      // 3. OpenAI Compatible general fallback
      if (modelLower === 'gpt-3.5-turbo' || modelLower === 'o1-mini') {
        return 'gpt-4o-mini';
      }
    }
    return model;
  }

  async analyzeImage(base64Image: string, settings: UserSettings): Promise<AnalysisResult> {
    const imageData = toOpenAiImageUrl(base64Image);
    const systemPrompt = getMasterAnalysisPrompt(settings);

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(true),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageData } },
              { type: 'text', text: systemPrompt },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI compatible analyze failed (${response.status})`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No content returned from model');
    return safeParseJSON<AnalysisResult>(text, {} as AnalysisResult);
  }

  async regenerateDimension(base64Image: string, dimension: DimensionKey, settings: UserSettings): Promise<PromptSegment> {
    const imageData = toOpenAiImageUrl(base64Image);
    const systemPrompt = getDimensionPrompt(dimension, settings);

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(true),
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageData } },
              { type: 'text', text: 'Analyze this image according to instructions.' },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Regeneration failed (${response.status})`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    return safeParseJSON<PromptSegment>(text || '{}', { original: '', translated: '' });
  }

  async explainTerm(term: string, language: string): Promise<TermExplanation> {
    const prompt = `As an expert Art Director, explain the visual style/term: "${term}".
Target Language: ${language}
Rules: Keep it VERY concise.
"def": Definition (Max 100 words).
"app": Application (Max 100 words).
Output JSON: { "def": "...", "app": "..." }`;

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(false),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Term explanation failed (${response.status})`);
    }

    const data = await response.json();
    return safeParseJSON<TermExplanation>(data.choices?.[0]?.message?.content || '{}', { def: '', app: '' });
  }

  async translateText(text: string, language: string): Promise<string> {
    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(false),
        messages: [{ role: 'user', content: getTranslationPrompt(text, language) }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation failed (${response.status})`);
    }

    const data = await response.json();
    const result = safeParseJSON<{ translated: string }>(data.choices?.[0]?.message?.content || '{}', { translated: '' });
    return result.translated || '';
  }

  async chat(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<{ text: string }> {
    const messages: any[] = [];
    messages.push({
      role: 'system',
      content: `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`,
    });

    let imageIncluded = false;
    const imageData = image ? toOpenAiImageUrl(image) : undefined;

    for (const h of history) {
      if (h.role === 'user' && imageData && !imageIncluded) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageData } },
            { type: 'text', text: h.text },
          ],
        });
        imageIncluded = true;
      } else {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text,
        });
      }
    }

    if (imageData && !imageIncluded) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageData } },
          { type: 'text', text: '[Image uploaded for analysis]' },
        ],
      });
      messages.push({ role: 'assistant', content: 'I can see the image. How can I help you analyze it?' });
    }

    messages.push({ role: 'user', content: message });

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(Boolean(image)),
        messages,
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Chat failed (${response.status})`);
    }

    const data = await response.json();
    return { text: data.choices?.[0]?.message?.content || '' };
  }

  async chatStream(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<ReadableStream> {
    const messages: any[] = [];
    messages.push({
      role: 'system',
      content: `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`,
    });

    let imageIncluded = false;
    const imageData = image ? toOpenAiImageUrl(image) : undefined;

    for (const h of history) {
      if (h.role === 'user' && imageData && !imageIncluded) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageData } },
            { type: 'text', text: h.text },
          ],
        });
        imageIncluded = true;
      } else {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text,
        });
      }
    }

    if (imageData && !imageIncluded) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageData } },
          { type: 'text', text: '[Image uploaded for analysis]' },
        ],
      });
      messages.push({ role: 'assistant', content: 'I can see the image. How can I help you analyze it?' });
    }

    messages.push({ role: 'user', content: message });

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(Boolean(image)),
        messages,
        temperature: 0.4,
        stream: true,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stream call failed (${response.status})`);
    }

    return createUnpackedTextStream(response, (line: string): string => {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') return '';
        try {
          const parsed = JSON.parse(dataStr);
          return parsed.choices?.[0]?.delta?.content || '';
        } catch {
          return '';
        }
      }
      return '';
    });
  }

  async termFollowup(params: {
    term: string;
    language: string;
    definition: string;
    application: string;
    thinking?: string;
    history: any[];
    message: string;
  }): Promise<{ text: string }> {
    const system = buildTermFollowupSystemPrompt(params);
    const messages = [
      { role: 'system', content: system },
      ...params.history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text || '' })),
      { role: 'user', content: params.message }
    ];

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModelName(false),
        messages,
        temperature: 0.4,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI compatible term followup failed (${response.status})`);
    }

    const data = await response.json();
    return { text: data.choices?.[0]?.message?.content || '' };
  }
}

// ====================================================
// 2. Anthropic Claude Server Provider
// ====================================================
export class ClaudeServerProvider implements ServerProvider {
  readonly name = 'claude';
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private getUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/messages`;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private extractBase64Media(base64Image: string): { mimeType: string; data: string } {
    const match = base64Image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    return { mimeType: 'image/jpeg', data: base64Image.replace(/^data:image\/[a-z]+;base64,/, '') };
  }

  async analyzeImage(base64Image: string, settings: UserSettings): Promise<AnalysisResult> {
    const { mimeType, data: imgData } = this.extractBase64Media(base64Image);
    const systemPrompt = getMasterAnalysisPrompt(settings);

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imgData,
                },
              },
              { type: 'text', text: systemPrompt },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Claude analyze failed (${response.status})`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('No content returned from Claude');
    return safeParseJSON<AnalysisResult>(text, {} as AnalysisResult);
  }

  async regenerateDimension(base64Image: string, dimension: DimensionKey, settings: UserSettings): Promise<PromptSegment> {
    const { mimeType, data: imgData } = this.extractBase64Media(base64Image);
    const systemPrompt = getDimensionPrompt(dimension, settings);

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imgData,
                },
              },
              { type: 'text', text: 'Analyze this image according to instructions.' },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Claude regeneration failed (${response.status})`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    return safeParseJSON<PromptSegment>(text || '{}', { original: '', translated: '' });
  }

  async explainTerm(term: string, language: string): Promise<TermExplanation> {
    const prompt = `As an expert Art Director, explain the visual style/term: "${term}".
Target Language: ${language}
Rules: Keep it VERY concise.
"def": Definition (Max 100 words).
"app": Application (Max 100 words).
Output JSON: { "def": "...", "app": "..." }`;

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Claude explain term failed (${response.status})`);
    }

    const data = await response.json();
    return safeParseJSON<TermExplanation>(data.content?.[0]?.text || '{}', { def: '', app: '' });
  }

  async translateText(text: string, language: string): Promise<string> {
    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: getTranslationPrompt(text, language) }],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude translation failed (${response.status})`);
    }

    const data = await response.json();
    const result = safeParseJSON<{ translated: string }>(data.content?.[0]?.text || '{}', { translated: '' });
    return result.translated || '';
  }

  async chat(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<{ text: string }> {
    const messages: any[] = [];
    const system = `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`;

    let imageIncluded = false;
    const imageData = image ? this.extractBase64Media(image) : undefined;

    for (const h of history) {
      if (h.role === 'user' && imageData && !imageIncluded) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mimeType,
                data: imageData.data,
              },
            },
            { type: 'text', text: h.text },
          ],
        });
        imageIncluded = true;
      } else {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text,
        });
      }
    }

    if (imageData && !imageIncluded) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mimeType,
              data: imageData.data,
            },
          },
          { type: 'text', text: '[Image uploaded for analysis]' },
        ],
      });
      messages.push({ role: 'assistant', content: 'I can see the image. How can I help you analyze it?' });
    }

    messages.push({ role: 'user', content: message });

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        system,
        messages,
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Claude chat failed (${response.status})`);
    }

    const data = await response.json();
    return { text: data.content?.[0]?.text || '' };
  }

  async chatStream(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<ReadableStream> {
    const messages: any[] = [];
    const system = `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`;

    let imageIncluded = false;
    const imageData = image ? this.extractBase64Media(image) : undefined;

    for (const h of history) {
      if (h.role === 'user' && imageData && !imageIncluded) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mimeType,
                data: imageData.data,
              },
            },
            { type: 'text', text: h.text },
          ],
        });
        imageIncluded = true;
      } else {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text,
        });
      }
    }

    if (imageData && !imageIncluded) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mimeType,
              data: imageData.data,
            },
          },
          { type: 'text', text: '[Image uploaded for analysis]' },
        ],
      });
      messages.push({ role: 'assistant', content: 'I can see the image. How can I help you analyze it?' });
    }

    messages.push({ role: 'user', content: message });

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        system,
        messages,
        temperature: 0.4,
        stream: true,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude stream failed (${response.status})`);
    }

    return createUnpackedTextStream(response, (line: string): string => {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === 'content_block_delta') {
            return parsed.delta?.text || '';
          }
        } catch {}
      }
      return '';
    });
  }

  async termFollowup(params: {
    term: string;
    language: string;
    definition: string;
    application: string;
    thinking?: string;
    history: any[];
    message: string;
  }): Promise<{ text: string }> {
    const system = buildTermFollowupSystemPrompt(params);
    const messages = [
      ...params.history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text || '' })),
      { role: 'user', content: params.message }
    ];

    const response = await fetch(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        system,
        messages,
        temperature: 0.4,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Claude term followup failed (${response.status})`);
    }

    const data = await response.json();
    return { text: data.content?.[0]?.text || '' };
  }
}

// ====================================================
// 3. Gemini Server Provider
// ====================================================
export class GeminiServerProvider implements ServerProvider {
  readonly name = 'gemini';
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private getClient() {
    const apiKey = (this.config.apiKey || '').trim();
    if (!apiKey) throw new Error("MISSING_API_KEY");
    const modelName = (this.config.model || 'gemini-2.5-flash').trim();
    const baseUrl = (this.config.baseUrl || '').trim();
    const options: any = { apiKey };
    if (baseUrl) {
      options.httpOptions = { baseUrl };
    }
    const ai = new GoogleGenAI(options);
    return { ai, modelName };
  }

  async analyzeImage(base64Image: string, settings: UserSettings): Promise<AnalysisResult> {
    const { ai, modelName } = this.getClient();
    const systemPrompt = getMasterAnalysisPrompt(settings);
    const imageData = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: imageData } },
        { text: systemPrompt },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            structuredPrompts: {
              type: Type.OBJECT,
              properties: {
                subject: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
                  required: ['original', 'translated'],
                },
                environment: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
                  required: ['original', 'translated'],
                },
                composition: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
                  required: ['original', 'translated'],
                },
                lighting: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
                  required: ['original', 'translated'],
                },
                mood: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
                  required: ['original', 'translated'],
                },
                style: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
                  required: ['original', 'translated'],
                },
              },
              required: ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'],
            },
          },
          required: ['structuredPrompts'],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('No content returned from Gemini');
    return safeParseJSON<AnalysisResult>(text, {} as AnalysisResult);
  }

  async regenerateDimension(base64Image: string, dimension: DimensionKey, settings: UserSettings): Promise<PromptSegment> {
    const { ai, modelName } = this.getClient();
    const systemPrompt = getDimensionPrompt(dimension, settings);
    const imageData = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: imageData } },
        { text: 'Analyze this image according to instructions.' },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING },
            translated: { type: Type.STRING },
          },
          required: ['original', 'translated'],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('No content returned from Gemini');
    return safeParseJSON<PromptSegment>(text, { original: '', translated: '' });
  }

  async explainTerm(term: string, language: string): Promise<TermExplanation> {
    const { ai, modelName } = this.getClient();
    const prompt = `As an expert Art Director, explain the visual style/term: "${term}".
Target Language: ${language}
Rules: Keep it VERY concise.
"def": Definition (Max 100 words).
"app": Application (Max 100 words).
Output JSON: { "def": "...", "app": "..." }`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('No content returned from Gemini');
    return safeParseJSON<TermExplanation>(text, { def: '', app: '' });
  }

  async translateText(text: string, language: string): Promise<string> {
    const { ai, modelName } = this.getClient();
    const prompt = getTranslationPrompt(text, language);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const result = safeParseJSON<{ translated: string }>(response.text || '{}', { translated: '' });
    return result.translated || '';
  }

  async chat(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<{ text: string }> {
    const { ai, modelName } = this.getClient();
    const systemInstruction = `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`;

    const historyParts: any[] = [];
    let imageIncluded = false;
    const imageData = image ? image.replace(/^data:image\/[a-z]+;base64,/, '') : undefined;

    for (const h of history) {
      if (h.role === 'user' && imageData && !imageIncluded) {
        historyParts.push({
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageData } },
            { text: h.text }
          ]
        });
        imageIncluded = true;
      } else {
        historyParts.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        });
      }
    }

    if (imageData && !imageIncluded) {
      historyParts.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageData } },
          { text: '[Image uploaded for analysis]' }
        ]
      });
      historyParts.push({
        role: 'model',
        parts: [{ text: 'I can see the image. How can I help you analyze it?' }]
      });
    }

    const chat = ai.chats.create({
      model: modelName,
      history: historyParts,
      config: { systemInstruction }
    });

    const response = await chat.sendMessage({ message });
    return { text: response.text || '' };
  }

  async chatStream(history: ChatMessage[], message: string, image?: string, settings?: UserSettings): Promise<ReadableStream> {
    const { ai, modelName } = this.getClient();
    const systemInstruction = `你是 Prompix 的视觉分析助手。回答语言使用 ${settings?.systemLanguage || 'Chinese'}。回答要简洁、专业、可执行。`;

    const historyParts: any[] = [];
    let imageIncluded = false;
    const imageData = image ? image.replace(/^data:image\/[a-z]+;base64,/, '') : undefined;

    for (const h of history) {
      if (h.role === 'user' && imageData && !imageIncluded) {
        historyParts.push({
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageData } },
            { text: h.text }
          ]
        });
        imageIncluded = true;
      } else {
        historyParts.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        });
      }
    }

    if (imageData && !imageIncluded) {
      historyParts.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageData } },
          { text: '[Image uploaded for analysis]' }
        ]
      });
      historyParts.push({
        role: 'model',
        parts: [{ text: 'I can see the image. How can I help you analyze it?' }]
      });
    }

    const chat = ai.chats.create({
      model: modelName,
      history: historyParts,
      config: { systemInstruction }
    });

    const resultStream = await chat.sendMessageStream({ message });
    
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resultStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });
  }

  async termFollowup(params: {
    term: string;
    language: string;
    definition: string;
    application: string;
    thinking?: string;
    history: any[];
    message: string;
  }): Promise<{ text: string }> {
    const { ai, modelName } = this.getClient();
    const systemInstruction = buildTermFollowupSystemPrompt(params);
    const historyParts = params.history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    const chat = ai.chats.create({
      model: modelName,
      history: historyParts,
      config: { systemInstruction }
    });

    const response = await chat.sendMessage({ message: params.message });
    return { text: response.text || '' };
  }
}

