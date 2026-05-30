import { AnalysisResult, HistoryItem, PromptOutputLanguage, DimensionKey } from '../types';
import { detectLanguage } from './languageDetect';

const DIMENSIONS = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'] as const;

const detectPromptLanguageFromAnalysis = (analysis?: AnalysisResult | null): PromptOutputLanguage | null => {
  if (!analysis) return null;

  for (const key of DIMENSIONS) {
    const text = analysis.structuredPrompts[key]?.original || '';
    const detected = detectLanguage(text);
    if (detected.confidence >= 0.7) {
      return detected.language === 'Chinese' ? 'zh' : 'en';
    }
  }

  return null;
};

export const resolveHistoryPromptLanguage = (
  item: HistoryItem,
  fallback: PromptOutputLanguage,
): PromptOutputLanguage => {
  if (item.promptLanguage === 'zh' || item.promptLanguage === 'en') {
    return item.promptLanguage;
  }

  const detected = detectPromptLanguageFromAnalysis(item.analysis);
  if (detected) return detected;

  if (item.analysisVariants?.zh && !item.analysisVariants?.en) return 'zh';
  if (item.analysisVariants?.en && !item.analysisVariants?.zh) return 'en';

  return fallback;
};

export const swapAnalysisResultLanguage = (analysis: AnalysisResult): AnalysisResult => {
  const swappedPrompts = {} as any;
  for (const key of DIMENSIONS) {
    const seg = analysis.structuredPrompts[key];
    swappedPrompts[key] = {
      original: seg?.translated || '',
      translated: seg?.original || '',
    };
  }
  return {
    ...analysis,
    structuredPrompts: swappedPrompts,
  };
};

export const getHistoryAnalysisByLanguage = (
  item: HistoryItem,
  language: PromptOutputLanguage,
): AnalysisResult | null => {
  if (item.analysisVariants?.[language]) return item.analysisVariants[language] || null;

  if (!item.analysisVariants || Object.keys(item.analysisVariants).length === 0) {
    const inferred = resolveHistoryPromptLanguage(item, language);
    if (inferred === language) return item.analysis;
  }

  // Handle legacy history items where only one variant is stored
  const variants = item.analysisVariants || {};
  const cachedKeys = Object.keys(variants) as PromptOutputLanguage[];
  if (cachedKeys.length > 0) {
    const firstKey = cachedKeys[0];
    const existing = variants[firstKey];
    if (existing && language !== firstKey) {
      return swapAnalysisResultLanguage(existing);
    }
  }

  return null;
};

export const upsertHistoryAnalysisVariant = (
  item: HistoryItem,
  language: PromptOutputLanguage,
  analysis: AnalysisResult,
): HistoryItem => {
  const oppositeLang: PromptOutputLanguage = language === 'zh' ? 'en' : 'zh';
  const oppositeAnalysis = swapAnalysisResultLanguage(analysis);
  return {
    ...item,
    analysis,
    promptLanguage: language,
    analysisVariants: {
      ...(item.analysisVariants || {}),
      [language]: analysis,
      [oppositeLang]: oppositeAnalysis,
    },
  };
};

