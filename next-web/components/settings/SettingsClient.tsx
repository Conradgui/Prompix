'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAppState } from '@/lib/state/app-state';
import { ApiConfig, PromptOutputLanguage } from '@/lib/types';
import { applyPromptOutputLanguage } from '@/lib/utils/promptOutput';
import { getModuleLabel, resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { canUseApiMode } from '@/lib/runtime/policy';
import {
  disableDeveloperMode,
  enableDeveloperMode,
  fetchDeveloperModeState,
  isLocalDeveloperModePolicy,
} from '@/lib/runtime/developer-mode';
import {
  DEFAULT_API_CONFIG,
  getApiConfig,
  setApiConfig,
} from '@/lib/services/providers';


const moduleKeys = ['Subject', 'Environment', 'Composition', 'Lighting', 'Mood', 'Style'];

export default function SettingsClient() {
  const router = useRouter();
  const {
    settings,
    saveSettings,
    clearLegacyHistoryAndWordbankCacheAction,
  } = useAppState();
  const [apiConfig, setApiConfigState] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [devModeAuthorized, setDevModeAuthorized] = useState(isLocalDeveloperModePolicy());
  const [devModeSource, setDevModeSource] = useState<'local' | 'public'>(isLocalDeveloperModePolicy() ? 'local' : 'public');
  const [devPassword, setDevPassword] = useState('');
  const [devModeLoading, setDevModeLoading] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheActionMessage, setCacheActionMessage] = useState('');
  const [devModeError, setDevModeError] = useState('');
  const [activeTab, setActiveTab] = useState<'api' | 'general' | 'copy' | 'dev'>('api');
  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];
  const apiModeEnabled = canUseApiMode();

  useEffect(() => {
    setApiConfigState(getApiConfig());
    void fetchDeveloperModeState().then((state) => {
      setDevModeAuthorized(state.authorized);
      setDevModeSource(state.source);
    });
  }, []);

  const enterDeveloperLab = async () => {
    setDevModeError('');
    if (devModeSource === 'local' || devModeAuthorized) {
      router.push('/dev-lab');
      return;
    }

    try {
      setDevModeLoading(true);
      const state = await enableDeveloperMode(devPassword);
      setDevModeAuthorized(state.authorized);
      setDevModeSource(state.source);
      if (state.authorized) {
        setDevPassword('');
        router.push('/dev-lab');
      }
    } catch (error: any) {
      setDevModeError(error?.message || (locale === 'zh' ? '验证失败。' : 'Verification failed.'));
    } finally {
      setDevModeLoading(false);
    }
  };

  const closeDeveloperMode = async () => {
    try {
      setDevModeLoading(true);
      await disableDeveloperMode();
      setDevModeAuthorized(false);
    } finally {
      setDevModeLoading(false);
    }
  };

  const selectedPromptLanguage = (settings.promptOutputLanguage || 'en') as PromptOutputLanguage;

  const activeModules = useMemo(
    () => settings.copyIncludedModules || moduleKeys,
    [settings.copyIncludedModules],
  );

  const applyApiConfig = (patch: Partial<ApiConfig>) => {
    if (!apiModeEnabled) return;
    setApiConfigState((prev) => ({ ...prev, ...patch }));
    setHasUnsavedChanges(true);
    setSaveStatus('idle');
  };

  const saveApiConfigAction = () => {
    if (!apiModeEnabled) return;
    try {
      const next = setApiConfig(apiConfig);
      setApiConfigState(next);
      setHasUnsavedChanges(false);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };


  const switchPromptLanguage = async (lang: PromptOutputLanguage) => {
    const next = applyPromptOutputLanguage(settings, lang);
    await saveSettings(next);
  };

  const clearLegacyCaches = async () => {
    const confirmed = window.confirm(text.settings.clearHistoryConfirm);
    if (!confirmed) return;

    try {
      setCacheClearing(true);
      setCacheActionMessage('');
      await clearLegacyHistoryAndWordbankCacheAction();
      setCacheActionMessage(text.settings.clearHistorySuccess);
    } catch (error: any) {
      setCacheActionMessage(`${text.settings.clearHistoryFailed}${error?.message || String(error)}`);
    } finally {
      setCacheClearing(false);
    }
  };

  const toggleModule = async (moduleKey: string) => {
    const nextSet = activeModules.includes(moduleKey)
      ? activeModules.filter((m) => m !== moduleKey)
      : [...activeModules, moduleKey];
    await saveSettings({ ...settings, copyIncludedModules: nextSet });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: 15 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { type: 'spring', stiffness: 100, damping: 15 },
    },
  };

  const tabs = [
    { id: 'api', label: locale === 'zh' ? '🔌 接口配置' : '🔌 API Connection' },
    { id: 'general', label: locale === 'zh' ? '⚙️ 通用设置' : '⚙️ General Preferences' },
    { id: 'copy', label: locale === 'zh' ? '📋 复制偏好' : '📋 Copy Preferences' },
    { id: 'dev', label: locale === 'zh' ? '🛠️ 开发者与重置' : '🛠️ Developer & Reset' },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto h-full w-full flex flex-col md:flex-row gap-5 overflow-hidden py-2 sm:py-4 px-2"
    >
      {/* Left Sidebar Menu */}
      <motion.div variants={itemVariants} className="w-full md:w-60 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pr-0 md:pr-2 shrink-0 select-none pb-2 md:pb-0 scrollbar-none">
        <div className="hidden md:block mb-4 pl-3">
          <h1 className="text-xl font-bold tracking-tight text-ag-text">{text.settings.title}</h1>
          <p className="text-xs text-ag-muted mt-1">{text.settings.desc}</p>
        </div>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-ag-accent text-white shadow-sm font-bold scale-[1.01]'
                : 'text-ag-muted hover:bg-ag-accent/8 hover:text-ag-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Right Content Panel */}
      <motion.div variants={itemVariants} className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-white/40 backdrop-blur-xl border border-white/20 rounded-2xl shadow-xl">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 ag-scrollbar space-y-6">
          {activeTab === 'api' && (
            <section className="space-y-4">
              <h2 className="text-sm font-bold tracking-wider uppercase text-ag-muted flex items-center gap-2">
                <span>🔌</span> {text.settings.apiConfig}
              </h2>
              {!apiModeEnabled ? (
                <p className="text-xs text-ag-muted/80">{text.settings.apiReadOnly}</p>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-ag-muted col-span-1 sm:col-span-2">
                  服务商 (Provider)
                  <select
                    disabled={!apiModeEnabled}
                    className="mt-1.5 w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                    value={apiConfig.provider || 'openai'}
                    onChange={(e) => {
                      const val = e.target.value;
                      let baseUrl = '';
                      let providerLabel = '';
                      let model = '';
                      const groupId = '';

                      if (val === 'openai') {
                        baseUrl = 'https://api.openai.com/v1';
                        providerLabel = 'OpenAI Compatible';
                        model = 'gpt-4o-mini';
                      } else if (val === 'claude') {
                        baseUrl = 'https://api.anthropic.com/v1';
                        providerLabel = 'Anthropic Claude';
                        model = 'claude-3-7-sonnet-latest';
                      } else if (val === 'siliconflow') {
                        baseUrl = 'https://api.siliconflow.cn/v1';
                        providerLabel = 'SiliconFlow';
                        model = 'Qwen/Qwen2.5-VL-72B-Instruct';
                      } else if (val === 'gemini') {
                        baseUrl = '';
                        providerLabel = 'Google Gemini';
                        model = 'gemini-2.5-flash';
                      }

                      applyApiConfig({
                        provider: val,
                        providerLabel,
                        baseUrl,
                        model,
                        groupId
                      });
                    }}
                  >
                    <option className="bg-ag-surface-solid dark:bg-[#1A1D24] text-ag-text" value="openai">OpenAI Compatible (如 GPT, Qwen, GLM, DeepSeek)</option>
                    <option className="bg-ag-surface-solid dark:bg-[#1A1D24] text-ag-text" value="claude">Anthropic Claude</option>
                    <option className="bg-ag-surface-solid dark:bg-[#1A1D24] text-ag-text" value="siliconflow">SiliconFlow (硅基流动)</option>
                    <option className="bg-ag-surface-solid dark:bg-[#1A1D24] text-ag-text" value="gemini">Google Gemini</option>
                  </select>
                </label>

                <label className="text-xs font-semibold text-ag-muted">
                  {text.settings.baseUrl}
                  <input
                    disabled={!apiModeEnabled}
                    className="mt-1.5 w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                    value={apiConfig.baseUrl}
                    onChange={(e) => applyApiConfig({ baseUrl: e.target.value })}
                  />
                </label>

                <label className="text-xs font-semibold text-ag-muted">
                  {text.settings.apiKey}
                  <input
                    disabled={!apiModeEnabled}
                    type="password"
                    placeholder="输入你的 API Key"
                    className="mt-1.5 w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                    value={apiConfig.apiKey}
                    onChange={(e) => applyApiConfig({ apiKey: e.target.value })}
                  />
                </label>

                {/* 多模态模型配置 */}
                <div className="text-xs font-semibold text-ag-muted col-span-1 sm:col-span-2">
                  <div className="flex items-center gap-1">
                    <span className="block">{text.settings.model}</span>
                    <span className="text-[10px] text-ag-muted/80 font-normal">{text.settings.modelHelp}</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      disabled={!apiModeEnabled}
                      placeholder={locale === 'zh' ? '请输入多模态大模型 ID (例如 qwen-vl-max)' : 'Enter multimodal model ID (e.g. gpt-4o-mini)'}
                      className="mt-1.5 w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                      value={apiConfig.model}
                      onChange={(e) => applyApiConfig({ model: e.target.value })}
                    />
                    {apiModeEnabled && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        <span className="text-[10px] text-ag-muted self-center mr-1">快捷预设:</span>
                        {apiConfig.provider === 'openai' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              GPT-4o-Mini
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              GPT-4o
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'qwen-vl-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Qwen-VL-Max
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'glm-4v', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              GLM-4V
                            </button>
                          </>
                        )}
                        {apiConfig.provider === 'siliconflow' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'Qwen/Qwen2.5-VL-72B-Instruct' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Qwen2.5-VL 72B
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'Qwen/Qwen2.5-VL-7B-Instruct' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Qwen2.5-VL 7B
                            </button>
                          </>
                        )}
                        {apiConfig.provider === 'claude' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'claude-3-7-sonnet-latest' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Claude 3.7 Sonnet
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'claude-3-5-sonnet-latest' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Claude 3.5 Sonnet
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'claude-3-5-opus-latest' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Claude 3.5 Opus
                            </button>
                          </>
                        )}
                        {apiConfig.provider === 'gemini' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'gemini-2.5-flash', baseUrl: '' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Gemini 2.5 Flash
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ model: 'gemini-3-flash-preview', baseUrl: '' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Gemini 3 Flash Preview
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 降本辅助模型配置（选填） */}
                <div className="text-xs font-semibold text-ag-muted col-span-1 sm:col-span-2 mt-4">
                  <div className="flex items-center gap-1">
                    <span className="block">{text.settings.textModel}</span>
                    <span className="text-[10px] text-ag-muted/80 font-normal">{text.settings.textModelHelp}</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      disabled={!apiModeEnabled}
                      placeholder={locale === 'zh' ? '选填，留空则默认使用多模态分析模型' : 'Optional. Defaults to Multimodal Model if blank'}
                      className="mt-1.5 w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                      value={apiConfig.textModel || ''}
                      onChange={(e) => applyApiConfig({ textModel: e.target.value })}
                    />
                    {apiModeEnabled && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        <span className="text-[10px] text-ag-muted self-center mr-1">快捷预设:</span>
                        {apiConfig.provider === 'openai' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ textModel: 'gpt-4o-mini' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              GPT-4o-Mini
                            </button>
                          </>
                        )}
                        {apiConfig.provider === 'siliconflow' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ textModel: 'deepseek-ai/DeepSeek-V3' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              DeepSeek-V3
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ textModel: 'deepseek-ai/DeepSeek-R1' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              DeepSeek-R1
                            </button>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ textModel: 'Qwen/Qwen2.5-7B-Instruct' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Qwen2.5-7B
                            </button>
                          </>
                        )}
                        {apiConfig.provider === 'claude' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ textModel: 'claude-3-5-haiku-latest' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Claude 3.5 Haiku
                            </button>
                          </>
                        )}
                        {apiConfig.provider === 'gemini' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyApiConfig({ textModel: 'gemini-2.5-flash' })}
                              className="rounded px-2 py-0.5 text-[10px] bg-ag-accent/5 text-ag-accent border border-ag-accent/10 hover:bg-ag-accent/10 transition"
                            >
                              Gemini 2.5 Flash
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {apiModeEnabled && (
                <div className="pt-5 border-t border-ag-border/20 flex items-center justify-between mt-6">
                  <div className="text-xs text-ag-muted/80">
                    {saveStatus === 'success' && (
                      <span className="text-green-600 font-semibold flex items-center gap-1">
                        ✓ {locale === 'zh' ? '配置已成功保存！' : 'Configuration saved successfully!'}
                      </span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="text-red-600 font-semibold flex items-center gap-1">
                        ✗ {locale === 'zh' ? '保存失败，请检查输入。' : 'Save failed, please check inputs.'}
                      </span>
                    )}
                    {saveStatus === 'idle' && hasUnsavedChanges && (
                      <span className="text-amber-600 font-medium flex items-center gap-1 animate-pulse">
                        ⚠ {locale === 'zh' ? '有未保存的配置修改，请点击保存' : 'You have unsaved configuration changes'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={saveApiConfigAction}
                    className="rounded-lg bg-ag-accent hover:bg-ag-accent-dark text-white px-4 py-2 font-bold text-xs transition duration-200 shadow-sm"
                  >
                    💾 {locale === 'zh' ? '保存已修改配置' : 'Save Config'}
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-bold tracking-wider uppercase text-ag-muted flex items-center gap-2">
                  <span>🗣️</span> {text.settings.promptLanguage}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => void switchPromptLanguage('zh')}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-all duration-200 ${
                      selectedPromptLanguage === 'zh'
                        ? 'border-ag-accent bg-ag-accent/10 text-ag-text font-medium shadow-sm'
                        : 'border-ag-border text-ag-muted hover:border-ag-accent/40'
                    }`}
                  >
                    {text.settings.zhOutput}
                  </button>
                  <button
                    onClick={() => void switchPromptLanguage('en')}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-all duration-200 ${
                      selectedPromptLanguage === 'en'
                        ? 'border-ag-accent bg-ag-accent/10 text-ag-text font-medium shadow-sm'
                        : 'border-ag-border text-ag-muted hover:border-ag-accent/40'
                    }`}
                  >
                    {text.settings.enOutput}
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-bold tracking-wider uppercase text-ag-muted flex items-center gap-2">
                  <span>🌐</span> {text.settings.appLanguage}
                </h2>
                <select
                  value={settings.systemLanguage || 'Chinese'}
                  onChange={(e) => void saveSettings({ ...settings, systemLanguage: e.target.value })}
                  className="w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                >
                  <option className="bg-ag-surface-solid dark:bg-[#1A1D24] text-ag-text" value="Chinese">{text.settings.languageChinese}</option>
                  <option className="bg-ag-surface-solid dark:bg-[#1A1D24] text-ag-text" value="English">{text.settings.languageEnglish}</option>
                </select>
              </section>
            </div>
          )}

          {activeTab === 'copy' && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold tracking-wider uppercase text-ag-muted flex items-center gap-2">
                <span>📋</span> {text.settings.copyModules}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {moduleKeys.map((key) => {
                  const active = activeModules.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => void toggleModule(key)}
                      className={`rounded-lg border px-2.5 py-2 text-left text-xs sm:text-sm transition-all duration-200 ${
                        active
                          ? 'border-ag-accent bg-ag-accent/10 text-ag-text font-medium shadow-sm'
                          : 'border-ag-border text-ag-muted hover:border-ag-accent/40'
                      }`}
                    >
                      {getModuleLabel(key, locale)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'dev' && (
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-bold tracking-wider uppercase text-ag-muted flex items-center gap-2">
                  <span>🛠️</span> {text.settings.developerMode}
                </h2>
                <p className="text-xs text-ag-muted/80">{text.settings.developerModeDesc}</p>
                {devModeSource === 'public' && !devModeAuthorized ? (
                  <label className="text-xs font-semibold text-ag-muted">
                    {text.settings.devPassword}
                    <input
                      type="password"
                      value={devPassword}
                      onChange={(e) => setDevPassword(e.target.value)}
                      placeholder={text.settings.devPasswordPlaceholder}
                      className="mt-1.5 w-full border-0 border-b border-ag-border bg-transparent px-0 py-2 text-sm text-ag-text outline-none focus:border-ag-accent transition duration-200"
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <PrimaryButton onClick={() => void enterDeveloperLab()} disabled={devModeLoading}>
                    {devModeSource === 'public' && !devModeAuthorized
                      ? text.settings.verifyAndEnter
                      : text.settings.openDevLab}
                  </PrimaryButton>
                  {devModeSource === 'public' && devModeAuthorized ? (
                    <button
                      onClick={() => void closeDeveloperMode()}
                      className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted hover:border-ag-accent/40 hover:text-ag-accent transition-all duration-200"
                      disabled={devModeLoading}
                    >
                      {text.settings.closeDevMode}
                    </button>
                  ) : null}
                </div>
                {devModeSource === 'public' ? (
                  <p className="text-xs text-ag-muted/80">
                    {devModeAuthorized ? text.settings.devModeEnabled : text.settings.devModeDisabled}
                  </p>
                ) : null}
                {devModeError ? <p className="text-xs text-red-600 font-medium">{devModeError}</p> : null}
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold tracking-wider uppercase text-ag-muted flex items-center gap-2">
                  <span>🗑️</span> {text.settings.cacheResetTitle}
                </h2>
                <p className="text-xs text-ag-muted/80">{text.settings.cacheResetDesc}</p>
                <button
                  onClick={() => void clearLegacyCaches()}
                  disabled={cacheClearing}
                  className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-600 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cacheClearing ? text.settings.clearHistoryLoading : text.settings.clearHistoryAction}
                </button>
                {cacheActionMessage ? <p className="text-xs text-ag-muted/90 font-medium">{cacheActionMessage}</p> : null}
              </section>
            </div>
          )}
        </div>

        {/* Footer Area */}
        <div className="px-6 py-3 bg-ag-surface/20 border-t border-ag-border/35 flex items-center justify-between shrink-0 select-none">
          <span className="text-[10px] text-ag-muted flex items-center gap-1.5">
            {activeTab === 'api' ? (
              hasUnsavedChanges ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {locale === 'zh' ? '有未保存的接口修改' : 'Unsaved API changes'}
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {locale === 'zh' ? '接口配置已就绪' : 'API config is ready'}
                </>
              )
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                {text.settings.autoSaved}
              </>
            )}
          </span>
          <button
            onClick={() => router.push('/')}
            className="text-xs text-ag-accent hover:text-ag-accent-dark font-medium transition-colors"
          >
            {locale === 'zh' ? '返回首页 →' : 'Back Home →'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}


