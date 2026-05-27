import { AnalysisResult, UserSettings, ChatMessage, PromptSegment, DimensionKey, ApiConfig, RuntimeMode } from '../../types';
import { enforceRuntimeModePolicy } from '../../runtime/policy';

export interface TermExplanation {
    def: string;
    app: string;
}

export interface AIProvider {
    readonly name: string;
    analyzeImage(base64Image: string, settings: UserSettings): Promise<AnalysisResult>;
    explainTerm(term: string, language: string): Promise<TermExplanation>;
    chatStream(
        history: ChatMessage[],
        message: string,
        image: string | undefined,
        onUpdate: (text: string) => void,
        settings?: UserSettings
    ): Promise<void>;
    translateText(text: string, language: string): Promise<string>;
    expandSearchQuery(query: string): Promise<string[][]>;
    regenerateDimension(
        base64Image: string,
        dimension: DimensionKey,
        settings: UserSettings
    ): Promise<PromptSegment>;
}

// 保留可扩展 provider 类型，当前运行时默认使用 MiniMax。
export type ProviderType = 'minimax' | 'gemini' | 'openai' | 'claude' | 'siliconflow';

export interface ModelDefinition {
    id: string;
    label: string;
    supportsVision: boolean;
}

export const PROVIDER_MODELS: Record<ProviderType, ModelDefinition[]> = {
    minimax: [
        { id: 'MiniMax-M2.5', label: 'MiniMax-M2.5 (默认)', supportsVision: true },
    ],
    gemini: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsVision: true },
        { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', supportsVision: true },
    ],
    openai: [
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini (默认)', supportsVision: true },
        { id: 'gpt-4o', label: 'GPT-4o', supportsVision: true },
    ],
    claude: [
        { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet', supportsVision: true },
        { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', supportsVision: true },
        { id: 'claude-3-5-opus-latest', label: 'Claude 3.5 Opus', supportsVision: true },
    ],
    siliconflow: [
        { id: 'Qwen/Qwen2.5-VL-72B-Instruct', label: 'Qwen2.5-VL 72B', supportsVision: true },
        { id: 'Qwen/Qwen2.5-VL-7B-Instruct', label: 'Qwen2.5-VL 7B', supportsVision: true },
        { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3 (文本只读)', supportsVision: false },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1 (文本只读)', supportsVision: false },
    ],
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
    minimax: 'MiniMax',
    gemini: 'Gemini',
    openai: 'OpenAI Compatible',
    claude: 'Claude',
    siliconflow: 'SiliconFlow',
};

export const STORAGE_KEYS = {
    RUNTIME_MODE: 'PROMPIX_RUNTIME_MODE',
    API_CONFIG: 'PROMPIX_API_CONFIG',
    PROVIDER: 'PROMPIX_PROVIDER',
    MODEL: 'PROMPIX_MODEL_ID',
    API_KEY_PREFIX: 'PROMPIX_API_KEY_',
};

const LEGACY_STORAGE_KEYS = {
    RUNTIME_MODE: 'SNAPLEX_RUNTIME_MODE',
    API_CONFIG: 'SNAPLEX_API_CONFIG',
    PROVIDER: 'SNAPLEX_PROVIDER',
    MODEL: 'SNAPLEX_MODEL_ID',
    API_KEY_PREFIX: 'SNAPLEX_API_KEY_',
};

const DEFAULT_RUNTIME_MODE: RuntimeMode = 'api';

export const DEFAULT_API_CONFIG: ApiConfig = {
    providerLabel: 'OpenAI Compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    groupId: '',
    provider: 'openai',
};

const parseJson = <T>(raw: string | null): T | null => {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const normalizeBaseUrl = (url: string): string => {
    if (!url) return DEFAULT_API_CONFIG.baseUrl;
    let trimmed = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
    if (trimmed.includes('xiaomimimo.com') && !trimmed.endsWith('/v1')) {
        trimmed = `${trimmed}/v1`;
    }
    return trimmed;
};

const cleanApiConfig = (partial: Partial<ApiConfig> | null): ApiConfig => {
    const cfg = partial || {};
    const baseUrl = normalizeBaseUrl(cfg.baseUrl || DEFAULT_API_CONFIG.baseUrl);
    let model = (cfg.model || DEFAULT_API_CONFIG.model).trim();
    if (baseUrl.includes('xiaomimimo.com') || model.toLowerCase().startsWith('mimo')) {
        model = model.toLowerCase();
    }
    return {
        providerLabel: (cfg.providerLabel || DEFAULT_API_CONFIG.providerLabel).trim(),
        baseUrl,
        apiKey: (cfg.apiKey || '').trim(),
        model,
        groupId: (cfg.groupId || '').trim(),
        provider: (cfg.provider || DEFAULT_API_CONFIG.provider || 'minimax').trim(),
    };
};

export const getRuntimeMode = (): RuntimeMode => {
    const mode = localStorage.getItem(STORAGE_KEYS.RUNTIME_MODE) || localStorage.getItem(LEGACY_STORAGE_KEYS.RUNTIME_MODE);
    const normalized = mode === 'api' ? 'api' : DEFAULT_RUNTIME_MODE;
    return enforceRuntimeModePolicy(normalized);
};

export const setRuntimeMode = (mode: RuntimeMode): RuntimeMode => {
    const next = enforceRuntimeModePolicy(mode);
    localStorage.setItem(STORAGE_KEYS.RUNTIME_MODE, next);
    return next;
};

export const getApiConfig = (): ApiConfig => {
    const current = parseJson<Partial<ApiConfig>>(localStorage.getItem(STORAGE_KEYS.API_CONFIG));
    if (current) return cleanApiConfig(current);

    const legacy = parseJson<Partial<ApiConfig>>(localStorage.getItem(LEGACY_STORAGE_KEYS.API_CONFIG));
    if (legacy) return cleanApiConfig(legacy);

    // 兼容早期分散存储
    const legacyModel = localStorage.getItem(LEGACY_STORAGE_KEYS.MODEL);
    const legacyKey = localStorage.getItem(`${LEGACY_STORAGE_KEYS.API_KEY_PREFIX}OPENAI`) || '';
    if (legacyModel || legacyKey) {
        return cleanApiConfig({
            providerLabel: 'MiniMax',
            baseUrl: DEFAULT_API_CONFIG.baseUrl,
            model: legacyModel || DEFAULT_API_CONFIG.model,
            apiKey: legacyKey,
            groupId: '',
        });
    }

    return { ...DEFAULT_API_CONFIG };
};

export const setApiConfig = (config: Partial<ApiConfig>): ApiConfig => {
    const next = cleanApiConfig({ ...getApiConfig(), ...config });
    localStorage.setItem(STORAGE_KEYS.API_CONFIG, JSON.stringify(next));
    localStorage.setItem(STORAGE_KEYS.MODEL, next.model);
    localStorage.setItem(STORAGE_KEYS.PROVIDER, next.provider || 'minimax');
    localStorage.setItem(`${STORAGE_KEYS.API_KEY_PREFIX}${(next.provider || 'minimax').toUpperCase()}`, next.apiKey);
    return next;
};

export const isApiConfigReady = (config: ApiConfig): boolean => {
    return Boolean(config.baseUrl && config.model && config.apiKey.trim());
};

export const getApiKey = (provider: ProviderType): string | null => {
    if (provider === 'minimax') {
        const cfg = getApiConfig();
        if (cfg.apiKey) return cfg.apiKey;
    }
    const current = localStorage.getItem(`${STORAGE_KEYS.API_KEY_PREFIX}${provider.toUpperCase()}`);
    if (current) return current;
    return localStorage.getItem(`${LEGACY_STORAGE_KEYS.API_KEY_PREFIX}${provider.toUpperCase()}`);
};

export const setApiKey = (provider: ProviderType, key: string): void => {
    const normalized = (key || '').trim();
    if (provider === 'minimax') {
        setApiConfig({ apiKey: normalized });
        return;
    }
    localStorage.setItem(`${STORAGE_KEYS.API_KEY_PREFIX}${provider.toUpperCase()}`, normalized);
};

export const getCurrentProvider = (): ProviderType => {
    const cfg = getApiConfig();
    return (cfg.provider as ProviderType) || 'openai';
};

export const getCurrentModel = (): string => {
    const model = getApiConfig().model;
    if (model) return model;
    return DEFAULT_API_CONFIG.model;
};

const KEY_PATTERNS: Record<ProviderType, RegExp> = {
    minimax: /^sk-[a-zA-Z0-9_-]{16,}$/,
    gemini: /^AIza[a-zA-Z0-9_-]{35}$/,
    openai: /^sk-[a-zA-Z0-9_-]{20,}$/,
    claude: /^sk-ant-[a-zA-Z0-9_-]+$/,
    siliconflow: /^sk-[a-zA-Z0-9]+$/,
};

export const validateKeyFormat = (provider: ProviderType, key: string): boolean => {
    if (!key || key.trim() === '') return false;
    const pattern = KEY_PATTERNS[provider];
    return pattern ? pattern.test(key.trim()) : true;
};

export const getKeyFormatError = (provider: ProviderType): string => {
    const providerNames = {
        minimax: 'MiniMax',
        gemini: 'Gemini',
        openai: 'OpenAI Compatible',
        claude: 'Claude',
        siliconflow: 'SiliconFlow'
    };
    const expectedPrefixes = {
        minimax: 'sk-',
        gemini: 'AIza',
        openai: 'sk-',
        claude: 'sk-ant-',
        siliconflow: 'sk-'
    };
    return `API Key 格式可能不正确：当前为 ${providerNames[provider]}，通常应以 "${expectedPrefixes[provider]}" 开头。`;
};
