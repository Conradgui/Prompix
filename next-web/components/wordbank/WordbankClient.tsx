'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Surface from '@/components/ui/Surface';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAppState } from '@/lib/state/app-state';
import { mineHistory, TermCategory } from '@/lib/utils/historyMiner';
import { askTermFollowUp, explainVisualTerm, TermExplanation } from '@/lib/services/geminiService';
import { getDimensionLabel, resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
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
import { buildPrefetchQueue } from '@/lib/utils/wordbankPrefetch';
import { TermFollowupMessage } from '@/lib/types';


const CATEGORY_ORDER: TermCategory[] = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'];

export default function WordbankClient() {
  const { historyItems, settings, hydrated } = useAppState();
  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];
  const language = useMemo(() => {
    const raw = (settings.systemLanguage || 'Chinese').trim().toLowerCase();
    if (
      raw === 'en' ||
      raw.includes('english') ||
      raw.includes('英文')
    ) {
      return 'English';
    }
    return 'Chinese';
  }, [settings.systemLanguage]);

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
  const [prefetchProgress, setPrefetchProgress] = useState({ total: 0, done: 0, running: false });

  const mined = useMemo(() => {
    if (!hydrated) return [];
    return mineHistory(historyItems);
  }, [hydrated, historyItems]);
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

  const fetchTermExplanation = useCallback(async (term: string): Promise<void> => {
    if (!term) return;

    if (applyCachedExplanation(term) && activeTermRef.current === term) {
      return;
    }

    const key = `${language}::${term.toLowerCase()}`;
    const inflight = inflightRef.current.get(key);
    if (inflight) {
      await inflight;
      return;
    }

    const task = (async () => {
      if (activeTermRef.current === term) {
        setActiveLoadingTerm(term);
      }

      try {
        let latestThinking = '';
        const next = await explainVisualTerm(term, language, (meta) => {
          latestThinking = meta?.thinking || '';
        });

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
        }
      } catch (error: any) {
        const fallback = getCachedTermExplanation(cacheRef.current, term, language);
        if (activeTermRef.current !== term) return;

        if (fallback && isValidTermExplanation(fallback)) {
          setExplanation({ def: fallback.def, app: fallback.app });
          setExplanationThinking(fallback.thinking || '');
          setErrorText(text.wordbank.loadKeptLast);
          return;
        }

        const msg = error?.message || (locale === 'zh' ? '术语解释失败，请稍后重试。' : 'Term explanation failed. Please retry.');
        setExplanation({
          def: `${text.wordbank.loadFailed}${msg}`,
          app: locale === 'zh' ? '请稍后重试。' : 'Please retry later.',
        });
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
  }, [applyCachedExplanation, language, locale, persistExplanationCache, text.wordbank.loadFailed, text.wordbank.loadKeptLast]);

  useEffect(() => {
    if (!hydrated || !cacheReady || !activeTerm) return;

    if (applyCachedExplanation(activeTerm)) {
      return;
    }

    void fetchTermExplanation(activeTerm);
  }, [activeTerm, applyCachedExplanation, cacheReady, fetchTermExplanation, hydrated]);

  useEffect(() => {
    if (!hydrated || !cacheReady) return;

    const orderedTerms = mined.map((item) => item.term);
    const queue = buildPrefetchQueue(orderedTerms, language, cacheRef.current);

    let cancelled = false;
    const initialDone = orderedTerms.length - queue.length;
    setPrefetchProgress({
      total: orderedTerms.length,
      done: initialDone,
      running: queue.length > 0,
    });

    if (!queue.length) return;

    const run = async () => {
      let done = initialDone;

      for (const term of queue) {
        if (cancelled) return;
        await fetchTermExplanation(term);
        if (cancelled) return;

        done += 1;
        setPrefetchProgress((prev) => ({
          ...prev,
          done,
          running: done < prev.total,
        }));
      }

      if (!cancelled) {
        setPrefetchProgress((prev) => ({ ...prev, running: false }));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [cacheReady, fetchTermExplanation, hydrated, language, mined]);

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
      const textReply = await askTermFollowUp({
        term,
        language,
        definition: explanation.def,
        application: explanation.app,
        thinking: explanationThinking,
        history,
        message,
        onMeta: (meta) => {
          followupThinking = meta?.thinking || '';
        },
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

  const prefetchText = prefetchProgress.total > 0

    ? (
      prefetchProgress.running
        ? `${text.wordbank.prefetching}${prefetchProgress.done}/${prefetchProgress.total}`
        : text.wordbank.prefetchDone
    )
    : '';

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
                        {message.text}
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
          </div>
        </Surface>
      </motion.div>
    </motion.div>
  );
}
