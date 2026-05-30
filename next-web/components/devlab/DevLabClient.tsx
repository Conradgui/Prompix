'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Surface from '@/components/ui/Surface';
import { useAppState } from '@/lib/state/app-state';
import { getDimensionLabel, resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { fetchDeveloperModeState } from '@/lib/runtime/developer-mode';
import { getHistoryAnalysisByLanguage, resolveHistoryPromptLanguage } from '@/lib/utils/analysisLanguage';
import {
  buildExternalReviewPackage,
  downloadExternalReviewJson,
  downloadExternalReviewZip,
  parseExternalReviewFeedbackFromText,
  validateExternalReviewFeedback,
} from '@/lib/utils/externalReview';
import {
  applyOptimizationMemories,
  buildOptimizationMemory,
  resolveActiveMemoryIds,
} from '@/lib/utils/optimizationMemory';
import { ExternalReviewFormInput, PromptOutputLanguage } from '@/lib/types';

const DIMENSIONS: Array<'subject' | 'environment' | 'composition' | 'lighting' | 'mood' | 'style'> = [
  'subject',
  'environment',
  'composition',
  'lighting',
  'mood',
  'style',
];

const DEFAULT_FORM: ExternalReviewFormInput = {
  objective: '',
  constraints: '',
  knownIssues: '',
  priority: '',
  targetModels: 'GPT-5 / Gemini 2.5 Pro',
  dimensionFocus: {
    subject: '',
    environment: '',
    composition: '',
    lighting: '',
    mood: '',
    style: '',
  },
};

export default function DevLabClient() {
  const {
    settings,
    currentImage,
    currentAnalysis,
    currentHistoryItem,
    upsertCurrentOptimizationMemory,
    toggleCurrentOptimizationMemory,
    removeCurrentOptimizationMemory,
    publishCurrentOptimizationVersion,
    applyCurrentPublishedVersion,
  } = useAppState();

  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [form, setForm] = useState<ExternalReviewFormInput>(DEFAULT_FORM);
  const [feedbackText, setFeedbackText] = useState('');
  const [statusText, setStatusText] = useState('');
  const [busy, setBusy] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);

  const preferredPromptLanguage: PromptOutputLanguage = settings.promptOutputLanguage === 'zh' ? 'zh' : 'en';
  const activePromptLanguage = currentHistoryItem
    ? resolveHistoryPromptLanguage(currentHistoryItem, preferredPromptLanguage)
    : preferredPromptLanguage;

  const baseAnalysis = currentHistoryItem
    ? getHistoryAnalysisByLanguage(currentHistoryItem, activePromptLanguage) || currentHistoryItem.analysis
    : currentAnalysis;

  const activeMemoryIds = currentHistoryItem ? resolveActiveMemoryIds(currentHistoryItem) : [];
  const memories = currentHistoryItem?.optimizationMemories || [];
  const publishedVersions = currentHistoryItem?.publishedVersions || [];

  const effectiveAnalysis = useMemo(() => {
    if (!baseAnalysis) return null;
    return applyOptimizationMemories(baseAnalysis, memories, activeMemoryIds, activePromptLanguage);
  }, [activeMemoryIds, activePromptLanguage, baseAnalysis, memories]);

  useEffect(() => {
    let cancelled = false;
    void fetchDeveloperModeState()
      .then((state) => {
        if (cancelled) return;
        setAuthorized(state.authorized);
      })
      .finally(() => {
        if (!cancelled) setCheckingAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const buildPackageOrThrow = () => {
    if (!currentImage || !effectiveAnalysis) {
      throw new Error(text.devlab.noAnalysis);
    }

    return buildExternalReviewPackage({
      language: activePromptLanguage,
      imageDataUrl: currentImage,
      baseAnalysis: effectiveAnalysis,
      form,
    });
  };

  const handleExportZip = async () => {
    try {
      setBusy(true);
      const pkg = buildPackageOrThrow();
      await downloadExternalReviewZip(pkg);
      setStatusText('');
    } catch (error: any) {
      setStatusText(`${text.devlab.exportFailed}${error?.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportJson = () => {
    try {
      const pkg = buildPackageOrThrow();
      downloadExternalReviewJson(pkg);
      setStatusText('');
    } catch (error: any) {
      setStatusText(`${text.devlab.exportFailed}${error?.message || String(error)}`);
    }
  };

  const handleCopyInstruction = async () => {
    try {
      const pkg = buildPackageOrThrow();
      await navigator.clipboard.writeText(pkg.instructionMarkdown);
      setStatusText('');
    } catch (error: any) {
      setStatusText(`${text.devlab.exportFailed}${error?.message || String(error)}`);
    }
  };

  const commitFeedback = async (raw: unknown) => {
    const validation = validateExternalReviewFeedback(raw, activePromptLanguage);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const memory = buildOptimizationMemory({
      feedback: validation.data,
      language: validation.data.language,
    });

    await upsertCurrentOptimizationMemory(memory);
    setStatusText(text.devlab.importSuccess);
  };

  const handleImportJsonFile = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      await commitFeedback(parsed);
    } catch (error: any) {
      setStatusText(`${text.devlab.importFailed}${error?.message || String(error)}`);
    }
  };

  const handleParseFeedbackText = async () => {
    try {
      const parsed = parseExternalReviewFeedbackFromText(feedbackText, activePromptLanguage);
      if (!parsed.ok) throw new Error(parsed.error);
      await commitFeedback(parsed.data);
    } catch (error: any) {
      setStatusText(`${text.devlab.importFailed}${error?.message || String(error)}`);
    }
  };

  const handlePublishVersion = async () => {
    try {
      const versionId = await publishCurrentOptimizationVersion();
      if (!versionId) {
        throw new Error(locale === 'zh' ? '请先启用至少一个记忆卡。' : 'Enable at least one memory card first.');
      }
      setStatusText(text.devlab.publishSuccess);
    } catch (error: any) {
      setStatusText(`${text.devlab.publishFailed}${error?.message || String(error)}`);
    }
  };

  if (checkingAccess) {
    return <Surface className="p-6 text-sm text-ag-muted">{text.devlab.loading}</Surface>;
  }

  if (!authorized) {
    return (
      <Surface className="space-y-3 p-6">
        <h1 className="text-xl font-semibold text-ag-text">{text.devlab.title}</h1>
        <p className="text-sm text-ag-muted">{text.devlab.restricted}</p>
        <Link className="text-sm text-ag-accent" href="/settings">{text.devlab.backToSettings}</Link>
      </Surface>
    );
  }

  if (!currentHistoryItem || !effectiveAnalysis || !currentImage) {
    return (
      <Surface className="space-y-3 p-6">
        <h1 className="text-xl font-semibold text-ag-text">{text.devlab.title}</h1>
        <p className="text-sm text-ag-muted">{text.devlab.noAnalysis}</p>
        <Link className="text-sm text-ag-accent" href="/analysis">{text.header.analysis}</Link>
      </Surface>
    );
  }

  return (
    <div className="h-full overflow-y-auto ag-scrollbar">
    <div className="space-y-5 pb-8">
      <Surface className="p-4 sm:p-5">
        <h1 className="text-xl font-semibold text-ag-text">{text.devlab.title}</h1>
        <p className="mt-2 text-sm text-ag-muted">{text.devlab.subtitle}</p>
      </Surface>

      <Surface className="space-y-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold tracking-wide text-ag-muted">{text.devlab.formTitle}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm text-ag-muted">
            {text.devlab.objective}
            <input
              value={form.objective}
              onChange={(e) => setForm((prev) => ({ ...prev, objective: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
            />
          </label>
          <label className="text-sm text-ag-muted">
            {text.devlab.constraints}
            <input
              value={form.constraints}
              onChange={(e) => setForm((prev) => ({ ...prev, constraints: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
            />
          </label>
          <label className="text-sm text-ag-muted">
            {text.devlab.knownIssues}
            <input
              value={form.knownIssues}
              onChange={(e) => setForm((prev) => ({ ...prev, knownIssues: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
            />
          </label>
          <label className="text-sm text-ag-muted">
            {text.devlab.priority}
            <input
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
            />
          </label>
          <label className="text-sm text-ag-muted md:col-span-2">
            {text.devlab.targetModels}
            <input
              value={form.targetModels}
              onChange={(e) => setForm((prev) => ({ ...prev, targetModels: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
            />
          </label>
          {DIMENSIONS.map((key) => (
            <label key={key} className="text-sm text-ag-muted">
              {getDimensionLabel(key, locale)}
              <input
                value={form.dimensionFocus[key]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    dimensionFocus: {
                      ...prev.dimensionFocus,
                      [key]: e.target.value,
                    },
                  }))
                }
                placeholder={effectiveAnalysis.structuredPrompts[key].original.slice(0, 40)}
                className="mt-1 w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => void handleExportZip()} disabled={busy}>{text.devlab.exportZip}</PrimaryButton>
          <button
            onClick={() => handleExportJson()}
            className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted"
          >
            {text.devlab.exportJson}
          </button>
          <button
            onClick={() => void handleCopyInstruction()}
            className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted"
          >
            {text.devlab.copyInstruction}
          </button>
        </div>
      </Surface>

      <Surface className="space-y-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold tracking-wide text-ag-muted">{text.devlab.importTitle}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => importRef.current?.click()}
            className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted"
          >
            {text.devlab.importJson}
          </button>
          <PrimaryButton onClick={() => void handleParseFeedbackText()}>{text.devlab.applyFeedback}</PrimaryButton>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleImportJsonFile(e.target.files?.[0])}
        />
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder={text.devlab.pasteFeedback}
          className="ag-scrollbar min-h-[180px] w-full rounded-lg border border-ag-border px-3 py-2 text-sm text-ag-text outline-none focus:border-ag-accent"
        />
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-ag-muted">{text.devlab.memoryTitle}</h2>
          <PrimaryButton onClick={() => void handlePublishVersion()}>{text.devlab.publishVersion}</PrimaryButton>
        </div>

        {!memories.length ? (
          <p className="text-sm text-ag-muted">{text.devlab.noMemory}</p>
        ) : (
          <div className="space-y-3">
            {memories.map((memory) => {
              const enabled = activeMemoryIds.includes(memory.id);
              return (
                <div key={memory.id} className="rounded-lg border border-ag-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ag-text">{memory.title}</p>
                      <p className="text-xs text-ag-muted">{new Date(memory.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void toggleCurrentOptimizationMemory(memory.id, !enabled)}
                        className="rounded-md border border-ag-border px-2.5 py-1 text-xs text-ag-muted"
                      >
                        {enabled ? text.devlab.disableMemory : text.devlab.enableMemory}
                      </button>
                      <button
                        onClick={() => void removeCurrentOptimizationMemory(memory.id)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600"
                      >
                        {text.devlab.removeMemory}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-ag-text">{memory.overallSummary}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-ag-muted">{text.devlab.publishedVersions}</h3>
          {!publishedVersions.length ? (
            <p className="text-xs text-ag-muted">-</p>
          ) : (
            publishedVersions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between rounded-lg border border-ag-border p-2">
                <div>
                  <p className="text-sm text-ag-text">{version.name}</p>
                  <p className="text-xs text-ag-muted">{new Date(version.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => void applyCurrentPublishedVersion(version.id)}
                  className="rounded-md border border-ag-border px-2.5 py-1 text-xs text-ag-muted"
                >
                  {text.devlab.applyVersion}
                </button>
              </div>
            ))
          )}
        </div>
      </Surface>

      {statusText ? <Surface className="p-3 text-sm text-ag-muted">{statusText}</Surface> : null}
    </div>
    </div>
  );
}
