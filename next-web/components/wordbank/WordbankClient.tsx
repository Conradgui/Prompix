'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import Surface from '@/components/ui/Surface';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAppState } from '@/lib/state/app-state';
import { mineHistory, TermCategory } from '@/lib/utils/historyMiner';
import { askTermFollowUp, explainVisualTerm, TermExplanation } from '@/lib/services/geminiService';
import { buildPrefetchQueue } from '@/lib/utils/wordbankPrefetch';
import { getDimensionLabel, resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { RuntimeMode } from '@/lib/types';
import {
  getCachedTermExplanation,
  isValidTermExplanation,
  loadTermExplanationCache,
  saveTermExplanationCache,
  TermExplanationCache,
  upsertTermExplanationCache,
} from '@/lib/utils/termExplanationCache';
import {
  appendTermFollowupMessages,
  clearTermFollowupThread,
  getTermFollowupThread,
  loadTermFollowupCache,
  saveTermFollowupCache,
  TermFollowupThreadCache,
} from '@/lib/utils/termFollowupCache';
import { TermFollowupMessage } from '@/lib/types';


interface ParsedError {
  code: string | number;
  message: string;
  isCustomProviderError: boolean;
}

const parseError = (error: any): ParsedError => {
  const msg = error?.message || String(error);
  
  let jsonStr = msg;
  const jsonMatch = msg.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed?.error) {
      return {
        code: parsed.error.code || 'ERROR',
        message: parsed.error.message || JSON.stringify(parsed.error),
        isCustomProviderError: true,
      };
    }
    if (parsed?.code || parsed?.message) {
      return {
        code: parsed.code || 'ERROR',
        message: parsed.message || JSON.stringify(parsed),
        isCustomProviderError: true,
      };
    }
  } catch {
    // Plain text
  }

  if (msg.includes('503') || msg.includes('500') || msg.includes('429') || msg.includes('401') || msg.includes('403')) {
    const codeMatch = msg.match(/(503|500|429|401|403)/);
    return {
      code: codeMatch ? codeMatch[1] : 'ERROR',
      message: msg,
      isCustomProviderError: true,
    };
  }

  return {
    code: 'ERROR',
    message: msg,
    isCustomProviderError: false,
  };
};

const CATEGORY_ORDER: TermCategory[] = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'];

export default function WordbankClient() {
  const { currentHistoryItem, settings, hydrated } = useAppState();
  const router = useRouter();
  const [activeTermMode, setActiveTermMode] = useState<Record<string, RuntimeMode>>({});
  const [lexiconError, setLexiconError] = useState<{
    code?: string | number;
    message: string;
    raw?: string;
    isCustomProviderError?: boolean;
    term: string;
  } | null>(null);
  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];
  const language = 'Chinese';

  const [activeCategory, setActiveCategory] = useState<TermCategory | 'all'>('all');
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [activeLoadingTerm, setActiveLoadingTerm] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<TermExplanation | null>(null);
  const [explanationThinking, setExplanationThinking] = useState('');
  const [cache, setCache] = useState<TermExplanationCache>({});
  const [cacheReady, setCacheReady] = useState(false);
  const [followupCache, setFollowupCache] = useState<TermFollowupThreadCache>({});
  const [followupInput, setFollowupInput] = useState('');
  const [followupSending, setFollowupSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [prefetchText, setPrefetchText] = useState<string | null>(null);


  const mined = useMemo(() => {
    if (!hydrated || !currentHistoryItem) return [];
    return mineHistory([currentHistoryItem]);
  }, [hydrated, currentHistoryItem]);
  const filteredTerms = useMemo(() => {
    if (activeCategory === 'all') return mined;
    return mined.filter((item) => item.category === activeCategory);
  }, [activeCategory, mined]);

  const cacheRef = useRef<TermExplanationCache>({});
  const activeTermRef = useRef<string | null>(null);
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  const loading = Boolean(activeTerm && activeLoadingTerm === activeTerm);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    activeTermRef.current = activeTerm;
  }, [activeTerm]);

  useEffect(() => {
    const initialExplanationCache = loadTermExplanationCache();
    const initialFollowupCache = loadTermFollowupCache();

    // Avoid first-render race: refs must hold hydrated cache before any fetch effects run.
    cacheRef.current = initialExplanationCache;
    setCache(initialExplanationCache);
    setFollowupCache(initialFollowupCache);
    setCacheReady(true);
  }, []);

  useEffect(() => {
    if (!filteredTerms.length) {
      setActiveTerm(null);
      setExplanation(null);
      setExplanationThinking('');
      setErrorText('');
      return;
    }

    if (!activeTerm || !filteredTerms.some((item) => item.term === activeTerm)) {
      setActiveTerm(filteredTerms[0].term);
      setExplanation(null);
      setExplanationThinking('');
      setErrorText('');
    }
  }, [activeTerm, filteredTerms]);

  useEffect(() => {
    setFollowupInput('');
  }, [activeTerm, language]);

  const persistExplanationCache = useCallback((nextCache: TermExplanationCache) => {
    cacheRef.current = nextCache;
    setCache(nextCache);
    saveTermExplanationCache(nextCache);
  }, []);

  const applyCachedExplanation = useCallback((term: string): boolean => {
    const cached = getCachedTermExplanation(cacheRef.current, term, language);
    if (!cached || !isValidTermExplanation(cached)) return false;

    setExplanation({ def: cached.def, app: cached.app });
    setExplanationThinking(cached.thinking || '');
    return true;
  }, [language]);

  const fetchTermExplanation = useCallback(async (term: string, forceMode?: RuntimeMode): Promise<void> => {
    if (!term) return;

    if (!forceMode && applyCachedExplanation(term) && activeTermRef.current === term) {
      setLexiconError(null);
      return;
    }

    const modeToUse = forceMode || 'api';
    const key = `${language}::${term.toLowerCase()}::${modeToUse}`;
    const inflight = inflightRef.current.get(key);
    if (inflight) {
      await inflight;
      if (activeTermRef.current === term) {
        applyCachedExplanation(term);
        setLexiconError(null);
      }
      return;
    }

    const task = (async () => {
      if (activeTermRef.current === term) {
        setActiveLoadingTerm(term);
        setLexiconError(null);
      }

      try {
        let latestThinking = '';
        const next = await explainVisualTerm(term, language, (meta) => {
          latestThinking = meta?.thinking || '';
        }, modeToUse);

        if (!isValidTermExplanation(next)) {
          throw new Error(locale === 'zh' ? '术语解释结果不完整。' : 'Incomplete explanation result.');
        }

        const nextCache = upsertTermExplanationCache(cacheRef.current, term, language, next, {
          thinking: latestThinking,
        });
        persistExplanationCache(nextCache);

        if (activeTermRef.current === term) {
          setExplanation(next);
          setExplanationThinking(latestThinking);
          setErrorText('');
          setLexiconError(null);
          setActiveTermMode((prev) => ({ ...prev, [term]: modeToUse }));
        }
      } catch (error: any) {
        if (activeTermRef.current !== term) return;

        if (!forceMode) {
          const fallback = getCachedTermExplanation(cacheRef.current, term, language);
          if (fallback && isValidTermExplanation(fallback)) {
            setExplanation({ def: fallback.def, app: fallback.app });
            setExplanationThinking(fallback.thinking || '');
            setErrorText(text.wordbank.loadKeptLast);
            setLexiconError(null);
            return;
          }
        }

        const rawMsg = error?.message || String(error);
        const parsed = parseError(error);

        setLexiconError({
          code: parsed.code,
          message: parsed.message,
          raw: rawMsg,
          isCustomProviderError: modeToUse === 'api' || parsed.isCustomProviderError,
          term: term,
        });
        setExplanation(null);
        setExplanationThinking('');
      } finally {
        if (activeTermRef.current === term) {
          setActiveLoadingTerm((prev) => (prev === term ? null : prev));
        }
      }
    })().finally(() => {
      inflightRef.current.delete(key);
    });

    inflightRef.current.set(key, task);
    await task;
  }, [applyCachedExplanation, language, locale, persistExplanationCache, text.wordbank.loadKeptLast]);

  useEffect(() => {
    if (!hydrated || !cacheReady || !activeTerm) return;

    if (applyCachedExplanation(activeTerm)) {
      setLexiconError(null);
      return;
    }

    setExplanation(null);
    setExplanationThinking('');
    setLexiconError(null);

    void fetchTermExplanation(activeTerm);
  }, [activeTerm, applyCachedExplanation, cacheReady, fetchTermExplanation, hydrated]);

  // Background prefetching of term explanations using a queue sorted by category priority
  useEffect(() => {
    if (!hydrated || !cacheReady || !mined.length) return;

    let active = true;

    const runPrefetch = async () => {
      const queue = buildPrefetchQueue(mined, language, cacheRef.current);
      if (queue.length === 0) {
        setPrefetchText(text.wordbank.prefetchDone);
        return;
      }

      setPrefetchText(`${text.wordbank.prefetching}0/${queue.length}`);

      let completedCount = 0;
      const totalCount = queue.length;

      for (let i = 0; i < queue.length; i++) {
        if (!active) break;

        const item = queue[i];
        
        const cached = getCachedTermExplanation(cacheRef.current, item.term, language);
        if (cached && isValidTermExplanation(cached)) {
          completedCount++;
          setPrefetchText(`${text.wordbank.prefetching}${completedCount}/${totalCount}`);
          continue;
        }

        try {
          await fetchTermExplanation(item.term);
        } catch (err) {
          console.warn(`Prefetch failed for term: ${item.term}`, err);
        }

        completedCount++;
        if (active) {
          if (completedCount === totalCount) {
            setPrefetchText(text.wordbank.prefetchDone);
          } else {
            setPrefetchText(`${text.wordbank.prefetching}${completedCount}/${totalCount}`);
          }
        }
      }
    };

    void runPrefetch();

    return () => {
      active = false;
    };
  }, [hydrated, cacheReady, mined, language, fetchTermExplanation, text.wordbank]);

  const activeThread = useMemo(() => {
    if (!activeTerm) return null;
    return getTermFollowupThread(followupCache, activeTerm, language);
  }, [activeTerm, followupCache, language]);

  const followupMessages = activeThread?.messages || [];

  const appendThreadMessages = useCallback((term: string, messages: TermFollowupMessage[]) => {
    setFollowupCache((prev) => {
      const next = appendTermFollowupMessages(prev, term, language, messages);
      saveTermFollowupCache(next);
      return next;
    });
  }, [language]);

  const handleFollowupSend = async () => {
    const term = activeTerm;
    const message = followupInput.trim();

    if (!term || !message || followupSending) return;

    if (!explanation || !isValidTermExplanation(explanation)) {
      setErrorText(text.wordbank.followupNeedExplanation);
      return;
    }

    const userMessage: TermFollowupMessage = {
      id: `term-user-${Date.now()}`,
      role: 'user',
      text: message,
      timestamp: Date.now(),
    };

    appendThreadMessages(term, [userMessage]);
    setFollowupInput('');
    setFollowupSending(true);
    setErrorText('');

    try {
      let followupThinking = '';
      const history = [...followupMessages, userMessage];
      const termMode = activeTermMode[term] || 'api';
      const textReply = await askTermFollowUp({
        term,
        language,
        definition: explanation?.def || '',
        application: explanation?.app || '',
        thinking: explanationThinking,
        history,
        message,
        onMeta: (meta) => {
          followupThinking = meta?.thinking || '';
        },
        forceMode: termMode,
      });

      const modelMessage: TermFollowupMessage = {
        id: `term-model-${Date.now()}`,
        role: 'model',
        text: textReply,
        timestamp: Date.now(),
        thinking: followupThinking,
      };

      appendThreadMessages(term, [modelMessage]);
    } catch (error: any) {
      setErrorText(`${text.wordbank.followupFailed}${error?.message || String(error)}`);
    } finally {
      setFollowupSending(false);
    }
  };

  const handleClearCurrentThread = () => {
    if (!activeTerm) return;
    setFollowupCache((prev) => {
      const next = clearTermFollowupThread(prev, activeTerm, language);
      saveTermFollowupCache(next);
      return next;
    });
    setFollowupInput('');
    setErrorText('');
  };

  if (!hydrated) {
    return <Surface className="p-8 text-center text-sm text-ag-muted">{text.wordbank.generating}</Surface>;
  }

  if (!mined.length) {
    return <Surface className="p-8 text-center text-sm text-ag-muted">{text.wordbank.empty}</Surface>;
  }



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
      className="h-full w-full grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] overflow-hidden py-1 px-0.5"
    >
      <motion.div variants={itemVariants} className="h-full overflow-hidden flex flex-col">
        <Surface className="flex-1 overflow-hidden flex flex-col p-3">
          <h2 className="mb-3 text-xs font-bold tracking-wider uppercase text-ag-muted shrink-0">{text.wordbank.termList}</h2>
          <div className="mb-3 flex flex-wrap gap-1.5 shrink-0">
            <button
              onClick={() => setActiveCategory('all')}
              className={`rounded-full border px-2.5 py-1 text-xs transition-all duration-200 ${
                activeCategory === 'all'
                  ? 'border-ag-accent bg-ag-accent/10 text-ag-text font-medium shadow-sm'
                  : 'border-ag-border/80 text-ag-muted hover:border-ag-accent/40 hover:text-ag-text'
              }`}
            >
              {text.wordbank.allCategories}
            </button>
            {CATEGORY_ORDER.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-all duration-200 ${
                  activeCategory === category
                    ? 'border-ag-accent bg-ag-accent/10 text-ag-text font-medium shadow-sm'
                    : 'border-ag-border/80 text-ag-muted hover:border-ag-accent/40 hover:text-ag-text'
                }`}
              >
                {getDimensionLabel(category, locale)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 ag-scrollbar">
            {filteredTerms.map((term) => (
              <button
                key={term.term}
                onClick={() => setActiveTerm(term.term)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-all duration-200 ${
                  activeTerm === term.term
                    ? 'border-ag-accent bg-ag-accent/10 text-ag-text font-medium shadow-sm'
                    : 'border-ag-border text-ag-muted hover:border-ag-accent/40 hover:text-ag-text'
                }`}
              >
                <p className="font-semibold">{term.term}</p>
                <p className="mt-1 text-xs opacity-75">{getDimensionLabel(term.category, locale)}</p>
              </button>
            ))}
          </div>
        </Surface>
      </motion.div>
 
      <motion.div variants={itemVariants} className="h-full overflow-hidden flex flex-col">
        <Surface className="flex-1 overflow-hidden flex flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <h1 className="text-2xl font-bold tracking-tight text-ag-text">{activeTerm}</h1>
            {loading ? <span className="text-xs text-ag-muted animate-pulse">{text.wordbank.generating}</span> : null}
          </div>
  
          {prefetchText ? <p className="mt-3 text-xs text-ag-muted/80 shrink-0">{prefetchText}</p> : null}
          {errorText ? <p className="mt-2 text-xs text-red-600 font-medium shrink-0">{errorText}</p> : null}
  
          <div className="flex-1 overflow-y-auto pr-1 space-y-5 ag-scrollbar mt-4">
            {lexiconError && lexiconError.term === activeTerm ? (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:p-5 text-xs text-red-600 dark:text-red-400 space-y-3 relative w-full overflow-hidden"
              >
                <div className="flex items-start justify-between pr-4">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <p className="font-semibold text-sm">
                      {lexiconError.isCustomProviderError 
                        ? (locale === 'zh' ? '自定义大模型术语解释服务报错' : 'Custom AI Term Explanation Service Error')
                        : (locale === 'zh' ? '获取术语解释遇到问题' : 'Term Explanation Request Encountered an Issue')
                      }
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 bg-red-500/5 dark:bg-red-500/10 p-3 rounded-lg border border-red-500/10 break-all break-words">
                  <p className="font-medium text-red-700 dark:text-red-300">
                    {locale === 'zh' ? '错误代码 (Error Code): ' : 'Error Code: '}
                    <span className="font-mono bg-red-500/10 px-1 py-0.5 rounded text-[11px] font-semibold">{lexiconError.code}</span>
                  </p>
                  <p className="leading-relaxed mt-1 text-red-600/90 dark:text-red-400/90">
                    {locale === 'zh' ? '详细原因: ' : 'Reason: '}
                    {lexiconError.message}
                  </p>
                  {lexiconError.raw && lexiconError.raw !== lexiconError.message && (
                    <details className="mt-2 text-[10px] text-red-500/70">
                      <summary className="cursor-pointer hover:underline outline-none">
                        {locale === 'zh' ? '查看原始错误日志' : 'View raw error log'}
                      </summary>
                      <pre className="mt-1 p-2 bg-black/5 dark:bg-black/20 rounded overflow-x-auto whitespace-pre-wrap font-mono text-[9px] max-h-32">
                        {lexiconError.raw}
                      </pre>
                    </details>
                  )}
                </div>

                {lexiconError.isCustomProviderError ? (
                  <>
                    <p className="text-[11px] text-ag-muted/95 leading-normal">
                      {locale === 'zh' 
                        ? '提示：如果您使用的是第三方大模型代理服务，报错显示底层的 Gemini 额度超限（如 429 报错及 gemini-2.5-flash 提示），这通常说明代理商后端的 Gemini 免费额度已耗尽。您可以选择：' 
                        : 'Tip: If you are using a proxy service, it might be due to its backend official Gemini quota exhaustion. You can:'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => router.push('/settings')}
                        className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 font-bold text-xs transition duration-200 shadow-sm"
                      >
                        {locale === 'zh' ? '⚙️ 前往设置检查配置' : '⚙️ Check Config in Settings'}
                      </button>
                      <button
                        onClick={() => void fetchTermExplanation(activeTerm, 'demo')}
                        className="rounded-lg border border-red-500/30 hover:border-red-500/50 bg-white/5 hover:bg-red-500/5 text-red-700 dark:text-red-300 px-3 py-1.5 font-bold text-xs transition duration-200"
                      >
                        {locale === 'zh' ? '✨ 尝试使用 Gemini 免费额度运行' : '✨ Try Platform Gemini Free Quota'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(String(lexiconError.code).includes('API_KEY') || String(lexiconError.code).includes('CONFIGURED') || lexiconError.message.includes('503')) ? (
                      <button
                        onClick={() => router.push('/settings')}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-300 hover:underline"
                      >
                        {locale === 'zh' ? '前往设置页面配置 API Key →' : 'Go to Settings to configure API Key →'}
                      </button>
                    ) : (
                      <button
                        onClick={() => void fetchTermExplanation(activeTerm, 'demo')}
                        className="rounded-lg border border-red-500/30 hover:border-red-500/50 bg-white/5 hover:bg-red-500/5 text-red-700 dark:text-red-300 px-3 py-1.5 font-bold text-xs transition duration-200"
                      >
                        {locale === 'zh' ? '✨ 尝试使用 Gemini 免费额度运行' : '✨ Try Platform Gemini Free Quota'}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <>
                {explanationThinking ? (
                  <section>
                    <details className="rounded-lg border border-ag-border bg-ag-surface/20 backdrop-blur-sm p-4 transition-colors hover:bg-ag-surface/30">
                      <summary className="cursor-pointer text-xs font-semibold tracking-wide text-ag-muted select-none">
                        {text.wordbank.viewThinking}
                      </summary>
                      <pre className="ag-scrollbar mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-ag-muted/95 bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-ag-border/40">{explanationThinking}</pre>
                    </details>
                  </section>
                ) : null}
      
                <section>
                  <h2 className="mb-2 text-xs font-bold tracking-wider uppercase text-ag-muted">{text.wordbank.definition}</h2>
                  <p className="rounded-lg border border-ag-border bg-ag-surface/25 backdrop-blur-sm p-4 text-sm leading-7 text-ag-text/95">
                    {explanation?.def || text.wordbank.noDefinition}
                  </p>
                </section>
      
                <section>
                  <h2 className="mb-2 text-xs font-bold tracking-wider uppercase text-ag-muted">{text.wordbank.application}</h2>
                  <p className="rounded-lg border border-ag-border bg-ag-surface/25 backdrop-blur-sm p-4 text-sm leading-7 text-ag-text/95">
                    {explanation?.app || text.wordbank.noApplication}
                  </p>
                </section>
      
                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs font-bold tracking-wider uppercase text-ag-muted">{text.wordbank.followupTitle}</h2>
                    <button
                      onClick={handleClearCurrentThread}
                      className="rounded-md border border-ag-border px-2.5 py-1 text-xs text-ag-muted hover:border-ag-accent/40 hover:text-ag-accent transition-all duration-200"
                    >
                      {text.wordbank.clearFollowup}
                    </button>
                  </div>
      
                  <div className="ag-scrollbar max-h-[220px] space-y-2 overflow-y-auto rounded-lg border border-ag-border bg-ag-surface/20 backdrop-blur-sm p-3">
                    {followupMessages.length === 0 ? (
                      <p className="text-sm text-ag-muted/80 text-center py-6">{text.wordbank.followupEmpty}</p>
                    ) : (
                      followupMessages.map((message) => (
                        <div key={message.id} className={`${message.role === 'user' ? 'ml-8' : 'mr-8'} space-y-2`}>
                          <div className={`rounded-xl px-3.5 py-2 text-sm shadow-sm border ${
                            message.role === 'user'
                              ? 'bg-ag-accent/15 text-ag-text border-ag-accent/20'
                              : 'bg-ag-surface/40 text-ag-text/95 border-ag-border/50'
                          }`}>
                            {message.role === 'user' ? (
                              message.text
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
                                {message.text}
                              </ReactMarkdown>
                            )}
                          </div>
                          {message.role === 'model' && message.thinking ? (
                            <details className="rounded-lg border border-ag-border bg-ag-surface/10 p-2.5">
                              <summary className="cursor-pointer text-xs text-ag-muted font-medium select-none">{text.wordbank.viewThinking}</summary>
                              <pre className="ag-scrollbar mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5 text-ag-muted/95 bg-black/5 dark:bg-white/5 p-2 rounded-md">{message.thinking}</pre>
                            </details>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
      
                  <div className="mt-3 flex gap-2 pb-1">
                    <input
                      value={followupInput}
                      onChange={(e) => setFollowupInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleFollowupSend();
                      }}
                      placeholder={text.wordbank.followupPlaceholder}
                      className="flex-1 rounded-lg border border-ag-border bg-ag-surface/40 focus:bg-ag-surface/90 px-3 py-2 text-sm outline-none transition duration-200 focus:border-ag-accent"
                    />
                    <PrimaryButton onClick={() => void handleFollowupSend()} disabled={followupSending || loading}>
                      {followupSending ? text.wordbank.followupSending : text.wordbank.followupSend}
                    </PrimaryButton>
                  </div>
                </section>
              </>
            )}
          </div>
        </Surface>
      </motion.div>
    </motion.div>
  );
}
