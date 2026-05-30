'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import Surface from '@/components/ui/Surface';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAppState } from '@/lib/state/app-state';
import { DimensionKey, PromptOutputLanguage, PromptSegment, ChatMessage, AnalysisResult } from '@/lib/types';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { analyzeImage, regenerateDimension, sendChatMessageStream } from '@/lib/services/geminiService';
import { getDimensionLabel, resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { applyPromptOutputLanguage } from '@/lib/utils/promptOutput';
import { getHistoryAnalysisByLanguage, resolveHistoryPromptLanguage } from '@/lib/utils/analysisLanguage';
import { applyOptimizationMemories, resolveActiveMemoryIds } from '@/lib/utils/optimizationMemory';
import { getMissingDimensions } from '@/lib/utils/analysisQuality';
import { compileFullPrompt } from '@/lib/utils/promptCompiler';


const dimensions: DimensionKey[] = [
  'subject',
  'environment',
  'composition',
  'lighting',
  'mood',
  'style',
];

const getDynamicNegativePrompt = (analysis: AnalysisResult): string => {
  const styleText = (analysis.structuredPrompts.style?.original || '').toLowerCase();
  const subjectText = (analysis.structuredPrompts.subject?.original || '').toLowerCase();

  // 1. 基础通用低质量负向词
  let negatives = ['worst quality', 'low quality', 'normal quality', 'jpeg artifacts', 'signature', 'watermark', 'username', 'blurry'];

  // 2. 检测是否有人物/人体（基于主体描述）
  const hasHuman = subjectText.includes('person') || subjectText.includes('boy') || 
                   subjectText.includes('girl') || subjectText.includes('man') || 
                   subjectText.includes('woman') || subjectText.includes('portrait') ||
                   subjectText.includes('face') || subjectText.includes('people') ||
                   subjectText.includes('人') || subjectText.includes('女') || subjectText.includes('男');
  if (hasHuman) {
    negatives = [
      ...negatives,
      'bad anatomy', 'bad hands', 'mutated hands and fingers', 'missing fingers',
      'extra limbs', 'deformed', 'disfigured', 'mutated', 'deformed iris', 'deformed pupils'
    ];
  }

  // 3. 检测风格类别
  const isAnime = styleText.includes('anime') || styleText.includes('manga') || 
                  styleText.includes('cartoon') || styleText.includes('comic') ||
                  styleText.includes('动漫') || styleText.includes('卡通') || styleText.includes('漫画');
  const isRealistic = styleText.includes('realistic') || styleText.includes('photo') || 
                      styleText.includes('photography') || styleText.includes('cinematic') ||
                      styleText.includes('写实') || styleText.includes('摄影') || styleText.includes('电影');

  if (isAnime) {
    negatives = [...negatives, 'photorealistic', 'realistic', '3d render', 'cgi', 'monochrome'];
  } else if (isRealistic) {
    negatives = [...negatives, 'drawing', 'painting', 'sketch', 'cartoon', 'anime', 'illustration', 'cgi', '3d render'];
  }

  return negatives.join(', ');
};

export default function AnalysisClient() {
  const router = useRouter();
  const {
    currentAnalysis,
    currentImage,
    currentHistoryItem,
    currentAnalyzeThinking,
    settings,
    loading,
    analysisProgress,
    setCurrentAnalyzeThinking,
    setCurrentPromptLanguage,
    updateCurrentAnalysis,
    updateCurrentChatHistory,
    toggleFavorite,
  } = useAppState();

  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'layers' | 'chat' | 'thinking'>('layers');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [refreshing, setRefreshing] = useState<DimensionKey | null>(null);
  const [chatThinkingByMessage, setChatThinkingByMessage] = useState<Record<string, string>>({});
  const [switchingLanguage, setSwitchingLanguage] = useState<PromptOutputLanguage | null>(null);
  const [autoFillingKey, setAutoFillingKey] = useState<DimensionKey | null>(null);
  const [autoFillStatus, setAutoFillStatus] = useState<{
    running: boolean;
    total: number;
    done: number;
    failed: DimensionKey[];
  } | null>(null);
  const autoFillAttemptedRef = useRef<Record<string, Set<DimensionKey>>>({});
  const autoFillRunningRef = useRef<string | null>(null);

  const [copiedDimension, setCopiedDimension] = useState<DimensionKey | 'all' | null>(null);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [mjParams, setMjParams] = useState(' --ar 16:9 --v 6.0');

  useEffect(() => {
    if (currentHistoryItem?.aspectRatio) {
      setMjParams(` --ar ${currentHistoryItem.aspectRatio} --v 6.0`);
    }
  }, [currentHistoryItem?.id, currentHistoryItem?.aspectRatio]);

  const [activeSliderKey, setActiveSliderKey] = useState<DimensionKey | null>(null);
  const [dimensionWeights, setDimensionWeights] = useState<Record<DimensionKey, number>>({
    subject: 1.0,
    environment: 1.0,
    composition: 1.0,
    lighting: 1.0,
    mood: 1.0,
    style: 1.0,
  });

  const chatHistory = currentHistoryItem?.chatHistory || [];
  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];
  const preferredPromptLanguage: PromptOutputLanguage = settings.promptOutputLanguage === 'zh' ? 'zh' : 'en';
  const activePromptLanguage = currentHistoryItem
    ? resolveHistoryPromptLanguage(currentHistoryItem, preferredPromptLanguage)
    : preferredPromptLanguage;
  const baseAnalysis = currentHistoryItem
    ? getHistoryAnalysisByLanguage(currentHistoryItem, activePromptLanguage) || currentHistoryItem.analysis
    : currentAnalysis;
  const effectiveAnalysis = currentHistoryItem && baseAnalysis
    ? applyOptimizationMemories(
      baseAnalysis,
      currentHistoryItem.optimizationMemories,
      resolveActiveMemoryIds(currentHistoryItem),
      activePromptLanguage,
    )
    : baseAnalysis;
  const currentHistoryItemId = currentHistoryItem?.id || null;

  useEffect(() => {
    setChatThinkingByMessage({});
  }, [currentHistoryItem?.id]);

  useEffect(() => {
    if (!currentHistoryItemId || !currentImage || !baseAnalysis) {
      setAutoFillingKey(null);
      setAutoFillStatus(null);
      return;
    }

    const recordLanguageKey = `${currentHistoryItemId}::${activePromptLanguage}`;
    if (autoFillRunningRef.current === recordLanguageKey) {
      return;
    }

    const attemptedMap = autoFillAttemptedRef.current;
    const attempted = attemptedMap[recordLanguageKey] || new Set<DimensionKey>();
    const missing = getMissingDimensions(baseAnalysis);
    const pending = missing.filter((key) => !attempted.has(key));

    if (!pending.length) {
      if (!missing.length) {
        setAutoFillingKey(null);
      }
      return;
    }

    pending.forEach((key) => attempted.add(key));
    attemptedMap[recordLanguageKey] = attempted;
    autoFillRunningRef.current = recordLanguageKey;

    let cancelled = false;

    setAutoFillStatus({
      running: true,
      total: pending.length,
      done: 0,
      failed: [],
    });

    void (async () => {
      let working = baseAnalysis;
      const failed: DimensionKey[] = [];
      const promptSettings = applyPromptOutputLanguage(settings, activePromptLanguage);

      for (let index = 0; index < pending.length; index += 1) {
        const key = pending[index];
        if (cancelled) break;

        setAutoFillingKey(key);
        try {
          const next = await regenerateDimension(currentImage, key, promptSettings);
          working = {
            ...working,
            structuredPrompts: {
              ...working.structuredPrompts,
              [key]: next,
            },
          };
          await updateCurrentAnalysis(working, { language: activePromptLanguage });
        } catch {
          failed.push(key);
        } finally {
          if (!cancelled) {
            setAutoFillStatus({
              running: index + 1 < pending.length,
              total: pending.length,
              done: index + 1,
              failed: [...failed],
            });
          }
        }
      }

      if (!cancelled) {
        setAutoFillingKey(null);
      }
      if (autoFillRunningRef.current === recordLanguageKey) {
        autoFillRunningRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      if (autoFillRunningRef.current === recordLanguageKey) {
        autoFillRunningRef.current = null;
      }
    };
  }, [activePromptLanguage, baseAnalysis, currentHistoryItemId, currentImage, settings, updateCurrentAnalysis]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr] xl:items-start animate-pulse">
        {/* 图片区域骨架 */}
        <Surface className="self-start overflow-hidden min-h-[360px] flex items-center justify-center bg-ag-surface/50 border-dashed border-2">
          <div className="text-center space-y-4 p-6">
            <div className="w-16 h-16 rounded-full bg-ag-accent/10 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-ag-accent animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p className="text-sm font-medium text-ag-text">正在启动多模态解析舱...</p>
            <p className="text-xs text-ag-muted">正在提取画面主体、构图与艺术特征</p>
            <div className="w-48 h-1.5 bg-ag-border rounded-full mx-auto overflow-hidden">
              <div className="bg-ag-accent h-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(4, analysisProgress))}%` }}></div>
            </div>
          </div>
        </Surface>

        {/* 维度卡片骨架 */}
        <div className="space-y-6">
          <Surface className="p-5 flex justify-between items-center bg-ag-surface/50">
            <div className="space-y-2">
              <div className="h-5 w-32 bg-ag-border rounded"></div>
              <div className="h-3 w-48 bg-ag-border rounded"></div>
            </div>
            <div className="h-8 w-24 bg-ag-border rounded-lg"></div>
          </Surface>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <Surface key={i} className="p-5 bg-ag-surface/50 space-y-3">
                <div className="h-4 w-20 bg-ag-border rounded"></div>
                <div className="space-y-2 pt-2">
                  <div className="h-3 w-full bg-ag-border rounded"></div>
                  <div className="h-3 w-5/6 bg-ag-border rounded"></div>
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!effectiveAnalysis || !currentImage) {
    return (
      <Surface className="p-8 text-center">
        <p className="text-ag-muted">{text.analysis.empty}</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link className="text-sm text-ag-accent" href="/">{text.analysis.backHome}</Link>
          <Link className="text-sm text-ag-accent" href="/library">{text.analysis.openFromHistory}</Link>
        </div>
      </Surface>
    );
  }

  const updateDimension = async (key: DimensionKey, next: PromptSegment) => {
    if (!baseAnalysis) return;
    const merged = {
      ...baseAnalysis,
      structuredPrompts: {
        ...baseAnalysis.structuredPrompts,
        [key]: next,
      },
    };
    await updateCurrentAnalysis(merged, { language: activePromptLanguage });
  };

  const handleRegenerate = async (key: DimensionKey) => {
    try {
      setRefreshing(key);
      const promptSettings = applyPromptOutputLanguage(settings, activePromptLanguage);
      const next = await regenerateDimension(currentImage, key, promptSettings);
      await updateDimension(key, next);
    } catch (error: any) {
      alert(`${text.analysis.refreshFailed}${error?.message || String(error)}`);
    } finally {
      setRefreshing(null);
    }
  };

  const getEnglishText = (seg: PromptSegment) => {
    if (activePromptLanguage === 'en') {
      return seg.original;
    } else {
      return seg.translated || seg.original;
    }
  };

  const handleCopyDimension = async (key: DimensionKey) => {
    const seg = effectiveAnalysis.structuredPrompts[key];
    const textToCopy = seg.original || '';
    if (!textToCopy) return;

    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopiedDimension(key);
      setTimeout(() => setCopiedDimension(null), 1500);
    }
  };

  const handleCopyFormatted = async (format: 'structured' | 'mj' | 'sd' | 'dalle' | 'plain') => {
    const activeModules = settings.copyIncludedModules || ['Subject', 'Environment', 'Composition', 'Lighting', 'Mood', 'Style'];
    
    const isDimensionEnabled = (k: DimensionKey): boolean => {
      const titleCase = k.charAt(0).toUpperCase() + k.slice(1);
      return activeModules.includes(titleCase);
    };

    const enabledKeys = dimensions.filter(isDimensionEnabled);
    if (!enabledKeys.length) {
      alert(locale === 'zh' ? '没有启用的复制模块，请在设置中勾选。' : 'No enabled modules to copy. Check settings.');
      return;
    }

    const payload = compileFullPrompt(
      enabledKeys,
      effectiveAnalysis.structuredPrompts,
      dimensionWeights,
      format,
      mjParams,
      getDynamicNegativePrompt(effectiveAnalysis),
      getEnglishText,
      (key) => getDimensionLabel(key, locale)
    );

    const ok = await copyToClipboard(payload);
    if (ok) {
      setCopiedDimension('all');
      setShowCopyDropdown(false);
      setTimeout(() => setCopiedDimension(null), 1500);
    }
  };

  const handleSwitchPromptLanguage = async (target: PromptOutputLanguage) => {
    if (!currentHistoryItem || !currentImage) return;
    if (target === activePromptLanguage || switchingLanguage) return;

    const cached = getHistoryAnalysisByLanguage(currentHistoryItem, target);
    if (cached) {
      await setCurrentPromptLanguage(target);
      setCurrentAnalyzeThinking(null);
      return;
    }

    try {
      setSwitchingLanguage(target);
      const analyzeSettings = applyPromptOutputLanguage(settings, target);
      const analyzed = await analyzeImage(currentImage, analyzeSettings, (meta) => {
        setCurrentAnalyzeThinking(meta?.thinking || null);
      });
      await updateCurrentAnalysis(analyzed, { language: target });
    } catch (error: any) {
      alert(`${text.analysis.switchLanguageFailed}${error?.message || String(error)}`);
    } finally {
      setSwitchingLanguage(null);
    }
  };

  const handleSend = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatStreaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      role: 'model',
      text: '',
      timestamp: Date.now(),
    };

    const seedHistory = [...chatHistory, userMsg, assistantMsg];
    await updateCurrentChatHistory(seedHistory);
    setChatInput('');
    setChatStreaming(true);

    try {
      await sendChatMessageStream(
        [...chatHistory, userMsg],
        trimmed,
        currentImage,
        async (text) => {
          setChatDraft(text);
          const merged = [...chatHistory, userMsg, { ...assistantMsg, text }];
          await updateCurrentChatHistory(merged);
        },
        settings,
        (meta) => {
          setChatThinkingByMessage((prev) => ({
            ...prev,
            [assistantMsg.id]: meta?.thinking || '',
          }));
        },
      );
    } finally {
      setChatStreaming(false);
      setChatDraft('');
    }
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

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 100, damping: 15 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="h-full w-full overflow-hidden grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 py-2 px-1"
    >
      {/* Left side: Image and quick actions */}
      <motion.div variants={cardVariants} className="h-full flex flex-col justify-between overflow-hidden space-y-4">
        <Surface className="flex-1 overflow-hidden shadow-lg border-ag-border/40 p-3 bg-white/40 backdrop-blur-xl border border-white/20 rounded-2xl flex flex-col justify-center items-center">
          <img
            src={currentImage}
            alt={text.analysis.imageAlt}
            className="w-full h-full max-h-[calc(100vh-280px)] rounded-xl object-contain bg-ag-surface/10"
          />
        </Surface>

        {/* Quick actions panel underneath the image */}
        <Surface className="p-4 shadow-md bg-white/30 backdrop-blur-md border border-white/10 rounded-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ag-muted">{text.analysis.promptLanguage}</span>
            <div className="inline-flex items-center rounded-full border border-ag-border/60 bg-ag-surface/40 backdrop-blur-md p-0.5">
              <button
                disabled={Boolean(switchingLanguage)}
                onClick={() => void handleSwitchPromptLanguage('en')}
                className={`rounded-full px-2.5 py-0.5 text-xs transition-all duration-200 ${
                  activePromptLanguage === 'en'
                    ? 'bg-ag-accent text-white shadow-sm'
                    : 'text-ag-muted hover:text-ag-text'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                EN
              </button>
              <button
                disabled={Boolean(switchingLanguage)}
                onClick={() => void handleSwitchPromptLanguage('zh')}
                className={`rounded-full px-2.5 py-0.5 text-xs transition-all duration-200 ${
                  activePromptLanguage === 'zh'
                    ? 'bg-ag-accent text-white shadow-sm'
                    : 'text-ag-muted hover:text-ag-text'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                ZH
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void toggleFavorite()}
              className={`flex-1 rounded-lg border py-1.5 text-xs transition-all duration-200 text-center ${
                currentHistoryItem?.isFavorite
                  ? 'border-ag-accent bg-ag-accent/8 text-ag-accent font-medium'
                  : 'border-ag-border text-ag-muted hover:border-ag-accent/40 hover:text-ag-text'
              }`}
            >
              {currentHistoryItem?.isFavorite ? text.analysis.favorited : text.analysis.favorite}
            </button>
            <button
              className="flex-1 rounded-lg border border-ag-border py-1.5 text-xs text-ag-muted hover:border-ag-accent/30 hover:text-ag-accent transition-all duration-200 text-center"
              onClick={() => router.push('/library')}
            >
              {text.analysis.openHistory}
            </button>
          </div>

          {/* Copy All formatted prompt dropdown button */}
          <div className="relative">
            <button
              onClick={() => setShowCopyDropdown(!showCopyDropdown)}
              className={`w-full rounded-lg border py-1.5 text-xs transition-all duration-200 flex items-center justify-center gap-1.5 ${
                copiedDimension === 'all'
                  ? 'border-green-600 bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'border-ag-accent bg-ag-accent text-white hover:bg-opacity-90 shadow-sm'
              }`}
            >
              <span>{copiedDimension === 'all' ? text.analysis.copied : text.analysis.copyAll}</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${showCopyDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <AnimatePresence>
              {showCopyDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCopyDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 right-0 rounded-xl border border-ag-border bg-white/90 dark:bg-[#17191D]/90 p-4 shadow-2xl z-20 space-y-3 backdrop-blur-xl"
                  >
                    <div className="space-y-1">
                      <button
                        onClick={() => void handleCopyFormatted('structured')}
                        className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-ag-text hover:bg-ag-accent/8 hover:text-ag-accent transition-colors"
                      >
                        📋 {text.analysis.copyStructured}
                      </button>
                      <button
                        onClick={() => void handleCopyFormatted('mj')}
                        className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-ag-text hover:bg-ag-accent/8 hover:text-ag-accent transition-colors"
                      >
                        ⛵ {text.analysis.copyMidjourney}
                      </button>
                      <button
                        onClick={() => void handleCopyFormatted('sd')}
                        className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-ag-text hover:bg-ag-accent/8 hover:text-ag-accent transition-colors"
                      >
                        🎨 {text.analysis.copyStableDiffusion}
                      </button>
                      <button
                        onClick={() => void handleCopyFormatted('dalle')}
                        className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-ag-text hover:bg-ag-accent/8 hover:text-ag-accent transition-colors"
                      >
                        🔮 {text.analysis.copyDalle}
                      </button>
                      <button
                        onClick={() => void handleCopyFormatted('plain')}
                        className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-ag-text hover:bg-ag-accent/8 hover:text-ag-accent transition-colors"
                      >
                        📝 {text.analysis.copyPlainText}
                      </button>
                    </div>

                    <hr className="border-ag-border" />

                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-ag-muted">Midjourney Parameters</span>
                      <input
                        type="text"
                        value={mjParams}
                        onChange={(e) => setMjParams(e.target.value)}
                        placeholder={text.analysis.mjParamsPlaceholder}
                        className="w-full rounded-lg border border-ag-border bg-ag-bg/40 focus:bg-ag-bg/90 px-2 py-1.5 text-[10px] text-ag-text outline-none transition duration-200 focus:border-ag-accent"
                      />
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </Surface>
      </motion.div>

      {/* Right side: Tabbed Panel */}
      <motion.div variants={cardVariants} className="h-full flex flex-col overflow-hidden bg-white/40 backdrop-blur-xl border border-white/20 rounded-2xl shadow-xl">
        {/* Tab Switcher Header */}
        <div className="flex items-center justify-between border-b border-ag-border/50 px-5 py-3.5 bg-ag-surface/20">
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveTab('layers')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                activeTab === 'layers'
                  ? 'bg-ag-accent text-white shadow-sm'
                  : 'text-ag-muted hover:bg-ag-accent/8 hover:text-ag-text'
              }`}
            >
              {locale === 'zh' ? '结构图层' : 'Prompt Layers'}
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 relative ${
                activeTab === 'chat'
                  ? 'bg-ag-accent text-white shadow-sm'
                  : 'text-ag-muted hover:bg-ag-accent/8 hover:text-ag-text'
              }`}
            >
              {text.analysis.chatTitle}
              {chatHistory.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ag-accent text-[9px] font-bold text-white border border-white dark:border-[#1E2129]">
                  {chatHistory.length}
                </span>
              )}
            </button>
            {currentAnalyzeThinking && (
              <button
                onClick={() => setActiveTab('thinking')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'thinking'
                    ? 'bg-ag-accent text-white shadow-sm'
                    : 'text-ag-muted hover:bg-ag-accent/8 hover:text-ag-text'
                }`}
              >
                {text.analysis.analysisThinkingTitle}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {switchingLanguage && (
              <span className="text-[10px] text-ag-muted animate-pulse">
                {text.analysis.switchingLanguage}
              </span>
            )}
            {autoFillStatus?.running && (
              <span className="text-[10px] text-ag-muted animate-pulse">
                {text.analysis.autoFillProgress}
                {autoFillStatus.done}/{autoFillStatus.total}
              </span>
            )}
            {autoFillStatus && !autoFillStatus.running && autoFillStatus.total > 0 && autoFillStatus.failed.length === 0 && (
              <span className="text-[10px] text-green-600 font-medium">{text.analysis.autoFillDone}</span>
            )}
            {(autoFillStatus?.failed?.length ?? 0) > 0 && (
              <span className="text-[10px] text-amber-600">
                {text.analysis.autoFillFailedPrefix}
                {autoFillStatus?.failed?.map((key) => getDimensionLabel(key, locale)).join('/')}
              </span>
            )}
          </div>
        </div>

        {/* Tab Contents Area */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'layers' && (
              <motion.div
                key="layers"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="h-full overflow-y-auto pr-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-3 ag-scrollbar max-h-[calc(100vh-180px)]"
              >
                {dimensions.map((key) => {
                  const label = getDimensionLabel(key, locale);
                  const seg = effectiveAnalysis.structuredPrompts[key];
                  const isRefreshing = refreshing === key || autoFillingKey === key;
                  const hasContent = Boolean(seg.original?.trim());
                  const autoWaiting = !hasContent && (isRefreshing || Boolean(autoFillStatus?.running));
                  const autoFailed = !hasContent && Boolean(autoFillStatus?.failed?.includes(key));
                  const isWeightSliderOpen = activeSliderKey === key;
                  return (
                    <Surface
                      key={key}
                      interactive
                      onClick={() => setActiveSliderKey(isWeightSliderOpen ? null : key)}
                      className="p-4 flex flex-col justify-between rounded-xl bg-white/30 backdrop-blur-md border border-white/10 hover:shadow-md transition duration-300 cursor-pointer"
                    >
                      <div>
                        <div className="mb-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <h2 className="text-xs font-bold tracking-wider uppercase text-ag-muted">{label}</h2>
                            {dimensionWeights[key] !== 1.0 && (
                              <span className="bg-ag-accent/10 border border-ag-accent/20 text-ag-accent text-[9px] font-bold px-1 py-0.5 rounded">
                                {dimensionWeights[key].toFixed(1)}x
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {hasContent && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleCopyDimension(key);
                                }}
                                className={`rounded px-1.5 py-0.5 text-[10px] transition-all duration-200 ${
                                  copiedDimension === key
                                    ? 'border border-green-600 bg-green-500/10 text-green-600 dark:text-green-400 font-medium'
                                    : 'border border-ag-border text-ag-muted hover:border-ag-accent/40 hover:text-ag-accent'
                                }`}
                              >
                                {copiedDimension === key ? text.analysis.copied : text.analysis.copy}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRegenerate(key);
                              }}
                              disabled={isRefreshing}
                              className="rounded border border-ag-border px-1.5 py-0.5 text-[10px] text-ag-muted hover:border-ag-accent/40 hover:text-ag-accent transition-all duration-200 disabled:opacity-50"
                            >
                              {isRefreshing ? text.analysis.refreshing : text.analysis.refresh}
                            </button>
                          </div>
                        </div>
                        {hasContent ? (
                          <p className="text-xs sm:text-sm leading-relaxed text-ag-text/95 whitespace-pre-wrap">{seg.original}</p>
                        ) : (
                          <p className={`text-xs sm:text-sm leading-relaxed ${autoFailed ? 'text-amber-600' : 'text-ag-muted/80'}`}>
                            {autoWaiting ? text.analysis.emptyAutoFilling : text.analysis.emptyNeedRefresh}
                          </p>
                        )}
                      </div>

                      <AnimatePresence>
                        {isWeightSliderOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden mt-3 pt-3 border-t border-ag-border/20 flex flex-col space-y-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-ag-muted font-medium">{locale === 'zh' ? '微调权重' : 'Prompt Weight'}</span>
                              <span className="font-bold text-ag-accent">{dimensionWeights[key].toFixed(1)}x</span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="2.0"
                              step="0.1"
                              value={dimensionWeights[key]}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setDimensionWeights((prev) => ({ ...prev, [key]: val }));
                              }}
                              className="w-full ag-range-slider accent-ag-accent cursor-pointer"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Surface>
                  );
                })}
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="h-full flex flex-col justify-between p-4 max-h-[calc(100vh-180px)] overflow-hidden"
              >
                <div className="flex-1 ag-scrollbar overflow-y-auto space-y-3 pr-1 pb-2">
                  {chatHistory.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-2">
                      <div className="text-3xl">💬</div>
                      <p className="text-xs text-ag-muted max-w-xs">{text.analysis.chatEmpty}</p>
                    </div>
                  ) : (
                    chatHistory.map((msg) => (
                      <div key={msg.id} className={`${msg.role === 'user' ? 'ml-12' : 'mr-12'} space-y-1.5`}>
                        <div className={`rounded-xl px-3 py-2 text-xs shadow-sm border ${
                          msg.role === 'user'
                            ? 'bg-ag-accent/15 text-ag-text border-ag-accent/20'
                            : 'bg-ag-surface/40 text-ag-text/95 border-ag-border/50'
                        }`}>
                          {msg.role === 'user' ? (
                            msg.text
                          ) : (
                            <ReactMarkdown
                              /* eslint-disable @typescript-eslint/no-unused-vars */
                              components={{
                                ul: ({ node, ...props }) => <ul className="list-disc pl-4 space-y-1 my-1" {...props} />,
                                ol: ({ node, ...props }) => <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />,
                                li: ({ node, ...props }) => <li className="my-0.5" {...props} />,
                                p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                                strong: ({ node, ...props }) => <strong className="font-semibold text-ag-text" {...props} />,
                              }}
                              /* eslint-enable @typescript-eslint/no-unused-vars */
                            >
                              {msg.text}
                            </ReactMarkdown>
                          )}
                        </div>
                        {msg.role === 'model' && chatThinkingByMessage[msg.id] && (
                          <details className="rounded-lg border border-ag-border bg-ag-surface/10 p-2">
                            <summary className="cursor-pointer text-[10px] text-ag-muted font-medium select-none">{text.analysis.viewThinking}</summary>
                            <pre className="ag-scrollbar mt-1.5 max-h-36 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-ag-muted/80 bg-black/5 dark:bg-white/5 p-2 rounded-md border border-ag-border/20">{chatThinkingByMessage[msg.id]}</pre>
                          </details>
                        )}
                      </div>
                    ))
                  )}
                  {chatStreaming && chatDraft && (
                    <p className="text-[10px] text-ag-muted animate-pulse pl-1">{text.analysis.streaming}</p>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-ag-border/20 bg-ag-surface/5">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSend();
                    }}
                    placeholder={text.analysis.inputPlaceholder}
                    className="flex-1 rounded-lg border border-ag-border bg-ag-surface/40 focus:bg-ag-surface/90 px-3 py-1.5 text-xs outline-none transition duration-200 focus:border-ag-accent"
                  />
                  <PrimaryButton onClick={() => void handleSend()} disabled={chatStreaming} className="text-xs px-4 py-1.5">{text.analysis.send}</PrimaryButton>
                </div>
              </motion.div>
            )}

            {activeTab === 'thinking' && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="h-full p-4 overflow-y-auto ag-scrollbar max-h-[calc(100vh-180px)]"
              >
                <pre className="ag-scrollbar text-xs leading-relaxed text-ag-muted/90 bg-black/5 dark:bg-white/5 p-3.5 rounded-lg border border-ag-border/40 whitespace-pre-wrap">{currentAnalyzeThinking}</pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

