import React, { useEffect, useMemo, useState } from 'react';
import { ApiConfig, PromptOutputLanguage, RuntimeMode, UserSettings } from '../types';
import { getTranslation } from '../translations';
import {
    DEFAULT_API_CONFIG,
    PROVIDER_MODELS,
    getApiConfig,
    getRuntimeMode,
    setApiConfig,
    setRuntimeMode,
} from '../services/providers';
import { applyPromptOutputLanguage } from '../utils/promptOutput';

interface Props {
    settings: UserSettings;
    onSave: (s: UserSettings) => void;
}

const MODULE_KEYS = ["Subject", "Environment", "Composition", "Lighting", "Mood", "Style"];

const Settings: React.FC<Props> = ({ settings, onSave }) => {
    const t = getTranslation(settings.systemLanguage);

    const [runtimeModeState, setRuntimeModeState] = useState<RuntimeMode>('demo');
    const [apiConfigState, setApiConfigState] = useState<ApiConfig>(DEFAULT_API_CONFIG);

    useEffect(() => {
        setRuntimeModeState(getRuntimeMode());
        setApiConfigState(getApiConfig());
    }, []);

    const moduleLabelMap: Record<string, string> = useMemo(() => ({
        Subject: t.lblSubject,
        Environment: t.lblEnvironment,
        Composition: t.lblComposition,
        Lighting: t.lblLighting,
        Mood: t.lblMood,
        Style: t.lblStyle,
    }), [t]);

    const styleOptions = [
        { id: 'Standard', label: t.styleStandard },
        { id: 'Artistic', label: t.styleArtistic },
        { id: 'Cinematic', label: t.styleCinematic },
        { id: 'Technical', label: t.styleTechnical },
        { id: 'UI/UX', label: t.styleUIUX },
    ];

    const handleRuntimeModeChange = (mode: RuntimeMode) => {
        setRuntimeModeState(mode);
        setRuntimeMode(mode);
    };

    const handleApiConfigChange = (patch: Partial<ApiConfig>) => {
        const next = setApiConfig({ ...apiConfigState, ...patch });
        setApiConfigState(next);
    };

    const handlePromptOutputLanguage = (lang: PromptOutputLanguage) => {
        onSave(applyPromptOutputLanguage(settings, lang));
    };

    const toggleModule = (moduleKey: string) => {
        const current = settings.copyIncludedModules || MODULE_KEYS;
        const next = current.includes(moduleKey)
            ? current.filter((m) => m !== moduleKey)
            : [...current, moduleKey];
        onSave({ ...settings, copyIncludedModules: next });
    };

    const modelOptions = PROVIDER_MODELS.openai;
    const selectedPromptLanguage = settings.promptOutputLanguage || 'zh';

    return (
        <div className="min-h-screen md:pt-36 pb-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-4xl mx-auto px-4 md:px-8 space-y-8">
                <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <h2 className="text-xl md:text-2xl font-black text-stone-800 mb-4">Prompix 运行模式</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                            onClick={() => handleRuntimeModeChange('demo')}
                            className={`text-left rounded-xl border px-4 py-4 transition-all ${runtimeModeState === 'demo' ? 'border-softblue bg-softblue/10' : 'border-stone-200 hover:border-stone-300'}`}
                        >
                            <div className="font-bold text-stone-800">免费试用（Demo）</div>
                            <div className="text-sm text-stone-500 mt-1">无需任何密钥，打开即可体验完整流程。</div>
                        </button>
                        <button
                            onClick={() => handleRuntimeModeChange('api')}
                            className={`text-left rounded-xl border px-4 py-4 transition-all ${runtimeModeState === 'api' ? 'border-softblue bg-softblue/10' : 'border-stone-200 hover:border-stone-300'}`}
                        >
                            <div className="font-bold text-stone-800">自定义API</div>
                            <div className="text-sm text-stone-500 mt-1">支持 OpenAI-compatible 的 `baseURL + model + key`。</div>
                        </button>
                    </div>
                </section>

                {runtimeModeState === 'api' && (
                    <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
                        <h3 className="text-lg font-black text-stone-800">自定义 API 配置</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Provider 名称</span>
                                <input
                                    className="mt-2 w-full border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-softblue"
                                    value={apiConfigState.providerLabel}
                                    onChange={(e) => handleApiConfigChange({ providerLabel: e.target.value })}
                                    placeholder="OpenAI"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Base URL</span>
                                <input
                                    className="mt-2 w-full border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-softblue"
                                    value={apiConfigState.baseUrl}
                                    onChange={(e) => handleApiConfigChange({ baseUrl: e.target.value })}
                                    placeholder="https://api.openai.com/v1"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">模型</span>
                                <select
                                    className="mt-2 w-full border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-softblue"
                                    value={apiConfigState.model}
                                    onChange={(e) => handleApiConfigChange({ model: e.target.value })}
                                >
                                    {modelOptions.map((m) => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">API Key</span>
                                <input
                                    type="password"
                                    className="mt-2 w-full border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-softblue"
                                    value={apiConfigState.apiKey}
                                    onChange={(e) => handleApiConfigChange({ apiKey: e.target.value })}
                                    placeholder="sk-..."
                                    autoComplete="off"
                                />
                            </label>
                        </div>
                        <p className="text-xs text-stone-500">密钥仅保存在当前浏览器本地，不会上传到 Prompix 服务器。</p>
                    </section>
                )}

                <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <h3 className="text-lg font-black text-stone-800 mb-3">Prompt 输出语言</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handlePromptOutputLanguage('zh')}
                            className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${selectedPromptLanguage === 'zh' ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}
                        >
                            中文
                        </button>
                        <button
                            onClick={() => handlePromptOutputLanguage('en')}
                            className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${selectedPromptLanguage === 'en' ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}
                        >
                            English
                        </button>
                    </div>
                </section>

                <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
                    <h3 className="text-lg font-black text-stone-800">基础设置</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">App 界面语言</span>
                            <select
                                className="mt-2 w-full border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-softblue"
                                value={settings.systemLanguage || 'Chinese'}
                                onChange={(e) => onSave({ ...settings, systemLanguage: e.target.value })}
                            >
                                <option value="Chinese">中文</option>
                                <option value="English">English</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">提示词风格</span>
                            <select
                                className="mt-2 w-full border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-softblue"
                                value={settings.descriptionStyle}
                                onChange={(e) => onSave({ ...settings, descriptionStyle: e.target.value })}
                            >
                                {styleOptions.map((style) => (
                                    <option key={style.id} value={style.id}>{style.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                </section>

                <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <h3 className="text-lg font-black text-stone-800 mb-3">一键复制模块</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {MODULE_KEYS.map((key) => {
                            const active = (settings.copyIncludedModules || MODULE_KEYS).includes(key);
                            return (
                                <button
                                    key={key}
                                    onClick={() => toggleModule(key)}
                                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${active ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}
                                >
                                    {moduleLabelMap[key] || key}
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Settings;
