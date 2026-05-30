'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AnalysisResult,
  ChatMessage,
  HistoryItem,
  PromptOptimizationMemory,
  PromptOutputLanguage,
  PromptPublishVersion,
  RuntimeMode,
  UserSettings,
  DEFAULT_SETTINGS,
} from '@/lib/types';
import { analyzeImage } from '@/lib/services/geminiService';
import { getRuntimeMode, setRuntimeMode } from '@/lib/services/providers';
import {
  clearLegacyHistoryAndWordbankCache,
  loadHistory,
  loadSettings,
  savePrimary,
  STORAGE_KEYS,
  saveHistoryImage,
  loadHistoryImage,
  deleteHistoryImage,
} from '@/lib/state/storage';
import { mergeHistoryWithDedupe } from '@/lib/utils/historyArchive';
import { getHistoryAnalysisByLanguage, resolveHistoryPromptLanguage, upsertHistoryAnalysisVariant, swapAnalysisResultLanguage } from '@/lib/utils/analysisLanguage';

interface AppStateContextValue {
  hydrated: boolean;
  loading: boolean;
  analysisProgress: number;
  runtimeMode: RuntimeMode;
  settings: UserSettings;
  historyItems: HistoryItem[];
  currentImage: string | null;
  currentAnalysis: AnalysisResult | null;
  currentHistoryId: string | null;
  currentHistoryItem: HistoryItem | null;
  currentAnalyzeThinking: string | null;
  saveSettings: (next: UserSettings) => Promise<void>;
  setCurrentAnalyzeThinking: (thinking: string | null) => void;
  setRuntimeModeAction: (mode: RuntimeMode) => void;
  setCurrentPromptLanguage: (language: PromptOutputLanguage) => Promise<void>;
  uploadImages: (files: File[], forceMode?: RuntimeMode) => Promise<void>;
  selectHistoryItem: (item: HistoryItem) => Promise<void>;
  clearCurrent: () => void;
  deleteHistoryItems: (ids: string[]) => Promise<void>;
  markHistoryAsExported: (ids: string[]) => Promise<void>;
  toggleFavorite: () => Promise<void>;
  updateCurrentChatHistory: (messages: ChatMessage[]) => Promise<void>;
  updateCurrentAnalysis: (analysis: AnalysisResult, options?: { language?: PromptOutputLanguage }) => Promise<void>;
  upsertCurrentOptimizationMemory: (memory: PromptOptimizationMemory) => Promise<void>;
  toggleCurrentOptimizationMemory: (memoryId: string, enabled: boolean) => Promise<void>;
  removeCurrentOptimizationMemory: (memoryId: string) => Promise<void>;
  publishCurrentOptimizationVersion: (name?: string) => Promise<string | null>;
  applyCurrentPublishedVersion: (versionId: string) => Promise<void>;
  mergeImportedHistory: (items: HistoryItem[]) => Promise<{ added: number; total: number }>;
  clearLegacyHistoryAndWordbankCacheAction: () => Promise<void>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids.filter(Boolean)));

export const calculateBestAspectRatio = (width: number, height: number): string => {
  if (width <= 0 || height <= 0 || isNaN(width) || isNaN(height) || !isFinite(width) || !isFinite(height)) return '1:1';
  const ratio = width / height;
  const presets = [
    { name: '1:1', val: 1.0 },
    { name: '16:9', val: 16 / 9 },
    { name: '9:16', val: 9 / 16 },
    { name: '4:3', val: 4 / 3 },
    { name: '3:4', val: 3 / 4 },
    { name: '3:2', val: 3 / 2 },
    { name: '2:3', val: 2 / 3 },
    { name: '21:9', val: 21 / 9 },
    { name: '9:21', val: 9 / 21 }
  ];
  
  let bestPreset = presets[0];
  let minDiff = Math.abs(ratio - bestPreset.val);
  
  for (const preset of presets) {
    const diff = Math.abs(ratio - preset.val);
    if (diff < minDiff) {
      minDiff = diff;
      bestPreset = preset;
    }
  }
  return bestPreset.name;
};

const compressImage = (file: File): Promise<{ base64: string; aspectRatio: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const aspectRatio = calculateBestAspectRatio(img.width, img.height);
      const canvas = document.createElement('canvas');
      const maxWidth = 1024;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve({
        base64: canvas.toDataURL('image/jpeg', 0.85),
        aspectRatio,
      });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
};

const createThumbnail = (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 400; // 400px for high-res previews
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Image); // Fallback to full image on canvas error
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // High quality jpeg
    };
    img.onerror = () => {
      resolve(base64Image); // Fallback to full image on loading error
    };
    img.src = base64Image;
  });
};

const migrateHistoryItems = async (items: HistoryItem[]): Promise<HistoryItem[]> => {
  let modified = false;
  const migrated = await Promise.all(
    items.map(async (item) => {
      // If imageUrl starts with data:image/ then it is a legacy full image inlined in the list
      if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
        const fullImage = item.imageUrl;
        try {
          await saveHistoryImage(item.id, fullImage);
          const thumbnail = await createThumbnail(fullImage);
          modified = true;
          return {
            ...item,
            imageUrl: '', // Strip full image from list metadata
            thumbnailUrl: thumbnail,
          };
        } catch (e) {
          console.error(`Failed to migrate history item image ${item.id}`, e);
        }
      }
      return item;
    })
  );

  if (modified) {
    try {
      await savePrimary(STORAGE_KEYS.history, migrated);
      console.log('Successfully migrated history item images to IndexedDB');
    } catch (e) {
      console.error('Failed to save migrated history metadata', e);
    }
  }
  return migrated;
};

const inferPromptOutputLanguage = (settings: Partial<UserSettings>): PromptOutputLanguage => {
  if (settings.promptOutputLanguage === 'zh' || settings.promptOutputLanguage === 'en') {
    return settings.promptOutputLanguage;
  }
  const front = (settings.cardFrontLanguage || '').trim().toLowerCase();
  if (front === 'zh' || front.includes('chinese') || front.includes('中文')) {
    return 'zh';
  }
  return 'en';
};

interface ActiveWorkspace {
  historyId: string | null;
  image: string | null;
  analysis: AnalysisResult | null;
  thinking: string | null;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const [runtimeMode, setRuntimeModeState] = useState<RuntimeMode>('demo');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>({
    historyId: null,
    image: null,
    analysis: null,
    thinking: null,
  });

  const currentImage = activeWorkspace.image;
  const currentAnalysis = activeWorkspace.analysis;
  const currentHistoryId = activeWorkspace.historyId;
  const currentAnalyzeThinking = activeWorkspace.thinking;

  const setCurrentAnalyzeThinking = useCallback((thinking: string | null) => {
    setActiveWorkspace((prev) => ({ ...prev, thinking }));
  }, []);

  const getPreferredPromptLanguage = useCallback((): PromptOutputLanguage => {
    return settings.promptOutputLanguage === 'zh' ? 'zh' : 'en';
  }, [settings.promptOutputLanguage]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loadedRuntime = getRuntimeMode();
        const loadedSettings = await loadSettings<UserSettings>();
        const loadedHistory = await loadHistory<HistoryItem[]>();

        if (cancelled) return;
        setRuntimeModeState(loadedRuntime);
        if (loadedSettings) {
          const merged = { ...DEFAULT_SETTINGS, ...loadedSettings };
          merged.promptOutputLanguage = inferPromptOutputLanguage(loadedSettings);
          setSettings(merged);
        }
        if (loadedHistory) {
          const migrated = await migrateHistoryItems(loadedHistory);
          setHistoryItems(migrated);

          // 初始化挂载时，如果本地有历史记录，自动激活最近一次的卡片，保持页面视觉一致性
          if (migrated.length > 0) {
            const latestItem = migrated[0];
            const prefLanguage = loadedSettings?.promptOutputLanguage === 'zh' ? 'zh' : 'en';
            const language = resolveHistoryPromptLanguage(latestItem, prefLanguage);
            const analysis = getHistoryAnalysisByLanguage(latestItem, language) || latestItem.analysis;
            let fullImage = latestItem.imageUrl;
            if (!fullImage || !fullImage.startsWith('data:image/')) {
              fullImage = await loadHistoryImage(latestItem.id) || latestItem.thumbnailUrl || '';
            }
            setActiveWorkspace({
              historyId: latestItem.id,
              image: fullImage,
              analysis,
              thinking: null,
            });
          }
        }
      } catch (error) {
        console.error('Failed to hydrate app state', error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistHistory = useCallback(async (next: HistoryItem[]) => {
    setHistoryItems(next);
    await savePrimary(STORAGE_KEYS.history, next);
  }, []);

  const currentHistoryItem = useMemo(() => {
    if (!currentHistoryId) return null;
    return historyItems.find((item) => item.id === currentHistoryId) || null;
  }, [currentHistoryId, historyItems]);

  const saveSettings = useCallback(async (next: UserSettings) => {
    setSettings(next);
    await savePrimary(STORAGE_KEYS.settings, next);
  }, []);

  const setRuntimeModeAction = useCallback((mode: RuntimeMode) => {
    const next = setRuntimeMode(mode);
    setRuntimeModeState(next);
  }, []);

  const clearCurrent = useCallback(() => {
    setActiveWorkspace({
      historyId: null,
      image: null,
      analysis: null,
      thinking: null,
    });
  }, []);

  const uploadImages = useCallback(async (files: File[], forceMode?: RuntimeMode) => {
    if (!files.length) return;

    clearCurrent();
    setLoading(true);
    setAnalysisProgress(0);
    const activePromptLanguage = getPreferredPromptLanguage();

    const progressInterval = window.setInterval(() => {
      setAnalysisProgress((prev) => (prev >= 90 ? prev : prev + Math.random() * 12));
    }, 450);

    try {
      const compressed = await Promise.all(files.map(compressImage));
      const firstImage = compressed[0].base64;
      const firstAspectRatio = compressed[0].aspectRatio;
      const firstThumbnail = await createThumbnail(firstImage);
      const firstAnalysis = await analyzeImage(firstImage, settings, (meta) => {
        setActiveWorkspace((prev) => ({
          ...prev,
          thinking: meta?.thinking || null,
        }));
      }, forceMode);

      const firstId = Date.now().toString();
      // Save full image to separate store
      await saveHistoryImage(firstId, firstImage);

      const oppositeLang: PromptOutputLanguage = activePromptLanguage === 'zh' ? 'en' : 'zh';
      const oppositeAnalysis = swapAnalysisResultLanguage(firstAnalysis);

      const firstItem: HistoryItem = {
        id: firstId,
        timestamp: Date.now(),
        imageUrl: '', // Strip full image from metadata
        thumbnailUrl: firstThumbnail,
        analysis: firstAnalysis,
        promptLanguage: activePromptLanguage,
        analysisVariants: {
          [activePromptLanguage]: firstAnalysis,
          [oppositeLang]: oppositeAnalysis,
        },
        read: true,
        isFavorite: false,
        chatHistory: [],
        lastViewedAt: Date.now(),
        aspectRatio: firstAspectRatio,
      };

      const rest = compressed.slice(1);
      const restItems: HistoryItem[] = [];

      for (let i = 0; i < rest.length; i += 1) {
        try {
          const restImage = rest[i].base64;
          const restAspectRatio = rest[i].aspectRatio;
          const analyzed = await analyzeImage(restImage, settings, undefined, forceMode);
          const restId = `${Date.now()}-${i}`;
          const restThumbnail = await createThumbnail(restImage);

          // Save full image to separate store
          await saveHistoryImage(restId, restImage);

          const loopOppositeLang: PromptOutputLanguage = activePromptLanguage === 'zh' ? 'en' : 'zh';
          const loopOppositeAnalysis = swapAnalysisResultLanguage(analyzed);

          restItems.push({
            id: restId,
            timestamp: Date.now(),
            imageUrl: '', // Strip full image from metadata
            thumbnailUrl: restThumbnail,
            analysis: analyzed,
            promptLanguage: activePromptLanguage,
            analysisVariants: {
              [activePromptLanguage]: analyzed,
              [loopOppositeLang]: loopOppositeAnalysis,
            },
            read: false,
            isFavorite: false,
            chatHistory: [],
            aspectRatio: restAspectRatio,
          });
        } catch (err) {
          console.warn('Background analyze failed', err);
        }
      }

      const nextHistory = [firstItem, ...restItems, ...historyItems];
      await persistHistory(nextHistory);

      setActiveWorkspace({
        historyId: firstId,
        image: firstImage,
        analysis: firstAnalysis,
        thinking: null,
      });
      setAnalysisProgress(100);
    } finally {
      window.clearInterval(progressInterval);
      setTimeout(() => {
        setLoading(false);
        setAnalysisProgress(0);
      }, 250);
    }
  }, [clearCurrent, getPreferredPromptLanguage, historyItems, persistHistory, settings]);

  const selectHistoryItem = useCallback(async (item: HistoryItem) => {
    const now = Date.now();
    const next = historyItems.map((history) =>
      history.id === item.id ? { ...history, read: true, lastViewedAt: now } : history
    );

    await persistHistory(next);
    const selected = next.find((history) => history.id === item.id) || item;
    const language = resolveHistoryPromptLanguage(selected, getPreferredPromptLanguage());
    const analysis = getHistoryAnalysisByLanguage(selected, language) || selected.analysis;

    // Lazily load full image from IndexedDB
    let fullImage = selected.imageUrl;
    if (!fullImage || !fullImage.startsWith('data:image/')) {
      fullImage = await loadHistoryImage(selected.id) || selected.thumbnailUrl || '';
    }

    setActiveWorkspace({
      historyId: selected.id,
      image: fullImage,
      analysis: analysis,
      thinking: null,
    });
  }, [getPreferredPromptLanguage, historyItems, persistHistory]);



  const clearLegacyHistoryAndWordbankCacheAction = useCallback(async () => {
    await clearLegacyHistoryAndWordbankCache();
    setHistoryItems([]);
    clearCurrent();
  }, [clearCurrent]);

  const deleteHistoryItems = useCallback(async (ids: string[]) => {
    const next = historyItems.filter((item) => !ids.includes(item.id));
    await persistHistory(next);

    // Delete associated full images from IndexedDB
    try {
      await Promise.all(ids.map(deleteHistoryImage));
    } catch (e) {
      console.error('Failed to clean up history images from IndexedDB', e);
    }

    if (currentHistoryId && ids.includes(currentHistoryId)) {
      clearCurrent();
    }
  }, [clearCurrent, currentHistoryId, historyItems, persistHistory]);

  const markHistoryAsExported = useCallback(async (ids: string[]) => {
    const now = Date.now();
    const next = historyItems.map((item) =>
      ids.includes(item.id)
        ? { ...item, read: true, lastExported: now }
        : item
    );
    await persistHistory(next);
  }, [historyItems, persistHistory]);

  const updateCurrentHistory = useCallback(async (updater: (item: HistoryItem) => HistoryItem) => {
    if (!currentHistoryId) return;

    const next = historyItems.map((item) => {
      if (item.id !== currentHistoryId) return item;
      return updater(item);
    });

    await persistHistory(next);

    const updated = next.find((item) => item.id === currentHistoryId) || null;
    if (updated) {
      const language = resolveHistoryPromptLanguage(updated, getPreferredPromptLanguage());
      const analysis = getHistoryAnalysisByLanguage(updated, language) || updated.analysis;
      setActiveWorkspace((prev) => ({
        ...prev,
        image: updated.imageUrl || prev.image,
        analysis,
      }));
    }
  }, [currentHistoryId, getPreferredPromptLanguage, historyItems, persistHistory]);

  const toggleFavorite = useCallback(async () => {
    await updateCurrentHistory((item) => ({ ...item, isFavorite: !item.isFavorite }));
  }, [updateCurrentHistory]);

  const updateCurrentChatHistory = useCallback(async (messages: ChatMessage[]) => {
    await updateCurrentHistory((item) => ({ ...item, chatHistory: messages }));
  }, [updateCurrentHistory]);

  const updateCurrentAnalysis = useCallback(async (analysis: AnalysisResult, options?: { language?: PromptOutputLanguage }) => {
    await updateCurrentHistory((item) => {
      const language = options?.language || resolveHistoryPromptLanguage(item, getPreferredPromptLanguage());
      return upsertHistoryAnalysisVariant(item, language, analysis);
    });
    setActiveWorkspace((prev) => ({ ...prev, analysis }));
  }, [getPreferredPromptLanguage, updateCurrentHistory]);

  const upsertCurrentOptimizationMemory = useCallback(async (memory: PromptOptimizationMemory) => {
    await updateCurrentHistory((item) => {
      const memories = item.optimizationMemories || [];
      const exists = memories.some((entry) => entry.id === memory.id);
      const nextMemories = exists
        ? memories.map((entry) => (entry.id === memory.id ? memory : entry))
        : [memory, ...memories];

      return {
        ...item,
        optimizationMemories: nextMemories,
        activeMemoryIds: uniqueIds([memory.id, ...(item.activeMemoryIds || [])]),
        publishedVersionId: undefined,
      };
    });
  }, [updateCurrentHistory]);

  const toggleCurrentOptimizationMemory = useCallback(async (memoryId: string, enabled: boolean) => {
    await updateCurrentHistory((item) => {
      const current = item.activeMemoryIds || [];
      const next = enabled
        ? uniqueIds([memoryId, ...current])
        : current.filter((id) => id !== memoryId);

      return {
        ...item,
        activeMemoryIds: next,
        publishedVersionId: undefined,
      };
    });
  }, [updateCurrentHistory]);

  const removeCurrentOptimizationMemory = useCallback(async (memoryId: string) => {
    await updateCurrentHistory((item) => {
      const nextMemories = (item.optimizationMemories || []).filter((memory) => memory.id !== memoryId);
      const nextActive = (item.activeMemoryIds || []).filter((id) => id !== memoryId);
      const nextPublished = (item.publishedVersions || []).map((version) => ({
        ...version,
        memoryIds: version.memoryIds.filter((id) => id !== memoryId),
      }));
      const versionStillExists = nextPublished.some((version) => version.id === item.publishedVersionId);

      return {
        ...item,
        optimizationMemories: nextMemories,
        activeMemoryIds: nextActive,
        publishedVersions: nextPublished,
        publishedVersionId: versionStillExists ? item.publishedVersionId : undefined,
      };
    });
  }, [updateCurrentHistory]);

  const publishCurrentOptimizationVersion = useCallback(async (name?: string) => {
    let createdVersionId: string | null = null;

    await updateCurrentHistory((item) => {
      const memories = item.optimizationMemories || [];
      const memorySet = new Set(memories.map((memory) => memory.id));
      const activeIds = uniqueIds((item.activeMemoryIds || []).filter((id) => memorySet.has(id)));

      if (!activeIds.length) return item;

      const now = Date.now();
      const version: PromptPublishVersion = {
        id: `pub-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: (name || '').trim() || `发布版本 ${new Date(now).toLocaleString()}`,
        createdAt: now,
        memoryIds: activeIds,
      };
      createdVersionId = version.id;

      return {
        ...item,
        publishedVersions: [version, ...(item.publishedVersions || [])],
        publishedVersionId: version.id,
      };
    });

    return createdVersionId;
  }, [updateCurrentHistory]);

  const applyCurrentPublishedVersion = useCallback(async (versionId: string) => {
    await updateCurrentHistory((item) => {
      const version = (item.publishedVersions || []).find((entry) => entry.id === versionId);
      if (!version) return item;

      return {
        ...item,
        activeMemoryIds: uniqueIds(version.memoryIds),
        publishedVersionId: version.id,
      };
    });
  }, [updateCurrentHistory]);

  const setCurrentPromptLanguage = useCallback(async (language: PromptOutputLanguage) => {
    await updateCurrentHistory((item) => {
      const cached = getHistoryAnalysisByLanguage(item, language);
      if (!cached) {
        return {
          ...item,
          promptLanguage: language,
        };
      }
      return {
        ...item,
        promptLanguage: language,
        analysis: cached,
      };
    });
  }, [updateCurrentHistory]);

  const mergeImportedHistory = useCallback(async (items: HistoryItem[]) => {
    const { merged, added } = mergeHistoryWithDedupe(historyItems, items);

    // Normalize imported items: extract full base64 images and generate thumbnails
    const sanitized = await Promise.all(
      merged.map(async (item) => {
        if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
          const fullImage = item.imageUrl;
          try {
            await saveHistoryImage(item.id, fullImage);
            const thumbnail = await createThumbnail(fullImage);
            return {
              ...item,
              imageUrl: '', // Strip full image
              thumbnailUrl: thumbnail,
            };
          } catch (e) {
            console.error(`Failed to extract image for imported item ${item.id}`, e);
          }
        }
        return item;
      })
    );

    await persistHistory(sanitized);
    return { added, total: sanitized.length };
  }, [historyItems, persistHistory]);

  const value = useMemo<AppStateContextValue>(() => ({
    hydrated,
    loading,
    analysisProgress,
    runtimeMode,
    settings,
    historyItems,
    currentImage,
    currentAnalysis,
    currentHistoryId,
    currentHistoryItem,
    currentAnalyzeThinking,
    saveSettings,
    setCurrentAnalyzeThinking,
    setRuntimeModeAction,
    setCurrentPromptLanguage,
    uploadImages,
    selectHistoryItem,
    clearCurrent,
    deleteHistoryItems,
    markHistoryAsExported,
    toggleFavorite,
    updateCurrentChatHistory,
    updateCurrentAnalysis,
    upsertCurrentOptimizationMemory,
    toggleCurrentOptimizationMemory,
    removeCurrentOptimizationMemory,
    publishCurrentOptimizationVersion,
    applyCurrentPublishedVersion,
    mergeImportedHistory,
    clearLegacyHistoryAndWordbankCacheAction,
  }), [
    analysisProgress,
    clearCurrent,
    currentAnalysis,
    currentHistoryId,
    currentHistoryItem,
    currentAnalyzeThinking,
    currentImage,
    deleteHistoryItems,
    hydrated,
    historyItems,
    loading,
    markHistoryAsExported,
    runtimeMode,
    saveSettings,
    setCurrentAnalyzeThinking,
    selectHistoryItem,
    setRuntimeModeAction,
    setCurrentPromptLanguage,
    settings,
    toggleFavorite,
    updateCurrentAnalysis,
    updateCurrentChatHistory,
    upsertCurrentOptimizationMemory,
    toggleCurrentOptimizationMemory,
    removeCurrentOptimizationMemory,
    publishCurrentOptimizationVersion,
    applyCurrentPublishedVersion,
    clearLegacyHistoryAndWordbankCacheAction,
    uploadImages,
    mergeImportedHistory,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
