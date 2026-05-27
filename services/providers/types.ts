import { AnalysisResult, UserSettings, ChatMessage, PromptSegment, DimensionKey, ApiConfig, RuntimeMode } from '../../types';

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

// 保留可扩展 provider 类型，当前运行时默认使用 openai-compatible。
export type ProviderType = 'gemini' | 'openai' | 'claude' | 'siliconflow';

export interface ModelDefinition {
    id: string;
    label: string;
    supportsVision: boolean;
}

export const PROVIDER_MODELS: Record<ProviderType, ModelDefinition[]> = {
    gemini: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsVision: true },
        { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', supportsVision: true },
    ],
    openai: [
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini (默认)', supportsVision: true },
        { id: 'gpt-4o', label: 'GPT-4o', supportsVision: true },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', supportsVision: true },
    ],
    claude: [
        { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', supportsVision: true },
    ],
    siliconflow: [
        { id: 'Qwen/Qwen2.5-VL-32B-Instruct', label: 'Qwen2.5-VL 32B', supportsVision: true },
    ],
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
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

const DEFAULT_RUNTIME_MODE: RuntimeMode = 'demo';

export const DEFAULT_API_CONFIG: ApiConfig = {
    providerLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
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
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
};

const cleanApiConfig = (partial: Partial<ApiConfig> | null): ApiConfig => {
    const cfg = partial || {};
    return {
        providerLabel: (cfg.providerLabel || DEFAULT_API_CONFIG.providerLabel).trim(),
        baseUrl: normalizeBaseUrl(cfg.baseUrl || DEFAULT_API_CONFIG.baseUrl),
        apiKey: (cfg.apiKey || '').trim(),
        model: (cfg.model || DEFAULT_API_CONFIG.model).trim(),
    };
};

export const getRuntimeMode = (): RuntimeMode => {
    const mode = localStorage.getItem(STORAGE_KEYS.RUNTIME_MODE) || localStorage.getItem(LEGACY_STORAGE_KEYS.RUNTIME_MODE);
    return mode === 'api' ? 'api' : DEFAULT_RUNTIME_MODE;
};

export const setRuntimeMode = (mode: RuntimeMode): void => {
    localStorage.setItem(STORAGE_KEYS.RUNTIME_MODE, mode);
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
            providerLabel: 'OpenAI',
            baseUrl: DEFAULT_API_CONFIG.baseUrl,
            model: legacyModel || DEFAULT_API_CONFIG.model,
            apiKey: legacyKey,
        });
    }

    return { ...DEFAULT_API_CONFIG };
};

export const setApiConfig = (config: Partial<ApiConfig>): ApiConfig => {
    const next = cleanApiConfig({ ...getApiConfig(), ...config });
    localStorage.setItem(STORAGE_KEYS.API_CONFIG, JSON.stringify(next));
    localStorage.setItem(STORAGE_KEYS.MODEL, next.model);
    localStorage.setItem(STORAGE_KEYS.PROVIDER, 'openai');
    localStorage.setItem(`${STORAGE_KEYS.API_KEY_PREFIX}OPENAI`, next.apiKey);
    return next;
};

export const isApiConfigReady = (config: ApiConfig): boolean => {
    return Boolean(config.baseUrl && config.model && config.apiKey.trim());
};

export const getApiKey = (provider: ProviderType): string | null => {
    if (provider === 'openai') {
        const cfg = getApiConfig();
        if (cfg.apiKey) return cfg.apiKey;
    }
    const current = localStorage.getItem(`${STORAGE_KEYS.API_KEY_PREFIX}${provider.toUpperCase()}`);
    if (current) return current;
    return localStorage.getItem(`${LEGACY_STORAGE_KEYS.API_KEY_PREFIX}${provider.toUpperCase()}`);
};

export const setApiKey = (provider: ProviderType, key: string): void => {
    const normalized = (key || '').trim();
    if (provider === 'openai') {
        setApiConfig({ apiKey: normalized });
        return;
    }
    localStorage.setItem(`${STORAGE_KEYS.API_KEY_PREFIX}${provider.toUpperCase()}`, normalized);
};

export const getCurrentProvider = (): ProviderType => {
    // 当前阶段统一走 openai-compatible 请求通道。
    return 'openai';
};

export const getCurrentModel = (): string => {
    const model = getApiConfig().model;
    if (model) return model;
    return DEFAULT_API_CONFIG.model;
};

const KEY_PATTERNS: Record<ProviderType, RegExp> = {
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
        gemini: 'Gemini',
        openai: 'OpenAI Compatible',
        claude: 'Claude',
        siliconflow: 'SiliconFlow'
    };
    const expectedPrefixes = {
        gemini: 'AIza',
        openai: 'sk-',
        claude: 'sk-ant-',
        siliconflow: 'sk-'
    };
    return `API Key 格式可能不正确：当前为 ${providerNames[provider]}，通常应以 "${expectedPrefixes[provider]}" 开头。`;
};
