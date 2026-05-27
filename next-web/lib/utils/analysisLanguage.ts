import { AnalysisResult, HistoryItem, PromptOutputLanguage } from '../types';
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

export const getHistoryAnalysisByLanguage = (
  item: HistoryItem,
  language: PromptOutputLanguage,
): AnalysisResult | null => {
  if (item.analysisVariants?.[language]) return item.analysisVariants[language] || null;

  if (!item.analysisVariants || Object.keys(item.analysisVariants).length === 0) {
    const inferred = resolveHistoryPromptLanguage(item, language);
    if (inferred === language) return item.analysis;
  }

  return null;
};

export const upsertHistoryAnalysisVariant = (
  item: HistoryItem,
  language: PromptOutputLanguage,
  analysis: AnalysisResult,
): HistoryItem => {
  return {
    ...item,
    analysis,
    promptLanguage: language,
    analysisVariants: {
      ...(item.analysisVariants || {}),
      [language]: analysis,
    },
  };
};

