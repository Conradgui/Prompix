'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Surface from '@/components/ui/Surface';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAppState } from '@/lib/state/app-state';
import { loadHistoryImage } from '@/lib/state/storage';
import { searchHistory } from '@/lib/services/geminiService';
import { DimensionKey, HistoryItem } from '@/lib/types';
import { getDimensionLabel, resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { buildHistoryExportPayload, parseHistoryImportPayload } from '@/lib/utils/historyArchive';
import { getHistoryAnalysisByLanguage, resolveHistoryPromptLanguage } from '@/lib/utils/analysisLanguage';
import { applyOptimizationMemories, resolveActiveMemoryIds } from '@/lib/utils/optimizationMemory';


const dimensions: DimensionKey[] = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'];

export default function LibraryClient() {
  const router = useRouter();
  const {
    historyItems,
    settings,
    selectHistoryItem,
    deleteHistoryItems,
    markHistoryAsExported,
    mergeImportedHistory,
  } = useAppState();

  const importInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];

  const visibleItems = useMemo(() => {
    if (!filteredIds) return historyItems;
    return historyItems.filter((item) => filteredIds.includes(item.id));
  }, [filteredIds, historyItems]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFilteredIds(null);
      return;
    }
    setSearching(true);
    try {
      const ids = await searchHistory(trimmed, historyItems);
      setFilteredIds(ids);
    } finally {
      setSearching(false);
    }
  };

  const handleOpen = async (item: HistoryItem) => {
    await selectHistoryItem(item);
    router.push('/analysis');
  };

  const handleExport = async () => {
    if (!selected.length) return;
    const selectedItems = historyItems.filter((item) => selected.includes(item.id));
    const fallbackLanguage = settings.promptOutputLanguage === 'zh' ? 'zh' : 'en';

    let table = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><tr><th>${text.library.tableImage}</th><th>${text.library.tablePrompt}</th></tr>`;

    for (const item of selectedItems) {
      const language = resolveHistoryPromptLanguage(item, fallbackLanguage);
      const baseAnalysis = getHistoryAnalysisByLanguage(item, language) || item.analysis;
      const activeAnalysis = applyOptimizationMemories(
        baseAnalysis,
        item.optimizationMemories,
        resolveActiveMemoryIds(item),
        language,
      );
      const sp = activeAnalysis.structuredPrompts;
      const rows = dimensions
        .map((key) => {
          const seg = (sp as any)[key];
          const label = getDimensionLabel(key, locale);
          return `[${label}]<br/>${seg?.original || 'N/A'}<br/><br/>`;
        })
        .join('');

      // Load full image lazily from IndexedDB for export
      let imgData = item.imageUrl || item.thumbnailUrl || '';
      if (!imgData || !imgData.startsWith('data:image/')) {
        imgData = await loadHistoryImage(item.id) || item.thumbnailUrl || '';
      }

      table += `<tr><td><img src="${imgData}" width="120" /></td><td>${rows}</td></tr>`;
    }

    table += '</table></body></html>';
    const blob = new Blob([table], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${text.library.exportFilePrefix}${Date.now()}.xls`;
    a.click();

    await markHistoryAsExported(selected);
    setSelectionMode(false);
    setSelected([]);
  };

  const handleExportJson = async () => {
    // Populate full images for complete JSON backup
    const exportedItems = await Promise.all(
      historyItems.map(async (item) => {
        let fullImage = item.imageUrl;
        if (!fullImage || !fullImage.startsWith('data:image/')) {
          fullImage = await loadHistoryImage(item.id) || item.thumbnailUrl || '';
        }
        return {
          ...item,
          imageUrl: fullImage, // Restore full image in the exported file
        };
      })
    );

    const payload = buildHistoryExportPayload(exportedItems);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompix_history_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const items = parseHistoryImportPayload(raw);
      const result = await mergeImportedHistory(items);
      alert(`${text.library.importSuccess}${result.added}，总计 ${result.total}`);
    } catch (error: any) {
      alert(`${text.library.importFailed}${error?.message || String(error)}`);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.03,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.96, y: 10 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 120, damping: 15 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="h-full w-full flex flex-col gap-4 overflow-hidden py-1 px-0.5"
    >
      <motion.div variants={cardVariants} className="shrink-0">
        <Surface className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold text-ag-text">{text.library.title}</h1>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExportJson()}
                className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted hover:border-ag-accent/40 hover:text-ag-accent transition-all duration-200"
              >
                {text.library.exportJson}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="rounded-lg border border-ag-border px-3 py-1.5 text-sm text-ag-muted hover:border-ag-accent/40 hover:text-ag-accent transition-all duration-200"
              >
                {text.library.importJson}
              </button>
              <button
                onClick={() => {
                  setSelectionMode((v) => !v);
                  setSelected([]);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-all duration-200 ${
                  selectionMode
                    ? 'border-ag-accent bg-ag-accent/8 text-ag-accent'
                    : 'border-ag-border text-ag-muted hover:border-ag-accent/40'
                }`}
              >
                {selectionMode ? text.library.cancelSelect : text.library.batchSelect}
              </button>
              {selectionMode ? <PrimaryButton onClick={() => void handleExport()}>{text.library.export}</PrimaryButton> : null}
              {selectionMode ? (
                <button
                  onClick={() => void deleteHistoryItems(selected)}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm transition-all duration-200"
                >
                  {text.library.delete}
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleImportJson(e.target.files?.[0])}
          />
  
          <div className="mt-3 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder={text.library.searchPlaceholder}
              className="flex-1 rounded-lg border border-ag-border bg-ag-surface/40 focus:bg-ag-surface/90 px-3 py-2 text-sm outline-none transition duration-200 focus:border-ag-accent"
            />
            <PrimaryButton onClick={() => void handleSearch()} disabled={searching}>{searching ? text.library.searching : text.library.search}</PrimaryButton>
          </div>
        </Surface>
      </motion.div>
  
      <div className="flex-1 overflow-y-auto pr-1 ag-scrollbar">
        {visibleItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 p-0.5">
            {visibleItems.map((item) => (
              <motion.div key={item.id} variants={cardVariants}>
                <Surface interactive className="overflow-hidden h-full">
                  <button
                    onClick={() => (selectionMode ? toggleSelected(item.id) : void handleOpen(item))}
                    className="group relative block h-full w-full text-left"
                  >
                    <img src={item.thumbnailUrl || item.imageUrl} alt={text.library.imageAlt} className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white transition-opacity duration-300 group-hover:from-black/90">
                      <p className="text-[11px] font-medium tracking-wide opacity-90">{new Date(item.timestamp).toLocaleDateString()}</p>
                    </div>
                    {selectionMode ? (
                      <span className={`absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs transition duration-250 ${selected.includes(item.id) ? 'border-ag-accent bg-ag-accent text-white shadow-md' : 'border-white bg-black/20 text-white backdrop-blur-sm'}`}>
                        ✓
                      </span>
                    ) : null}
                  </button>
                </Surface>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div variants={cardVariants}>
            <Surface className="p-8 text-center text-sm text-ag-muted/80">{text.library.empty}</Surface>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

