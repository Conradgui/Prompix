import {
  AnalysisResult,
  DimensionKey,
  ExternalReviewFeedback,
  HistoryItem,
  PromptOptimizationMemory,
  PromptOutputLanguage,
} from '../types';

const DIMENSIONS: DimensionKey[] = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'];

const cloneAnalysis = (analysis: AnalysisResult): AnalysisResult => {
  return {
    description: analysis.description || '',
    structuredPrompts: {
      subject: { ...analysis.structuredPrompts.subject },
      environment: { ...analysis.structuredPrompts.environment },
      composition: { ...analysis.structuredPrompts.composition },
      lighting: { ...analysis.structuredPrompts.lighting },
      mood: { ...analysis.structuredPrompts.mood },
      style: { ...analysis.structuredPrompts.style },
    },
  };
};

const normalizeIds = (ids: string[] | undefined): string[] => {
  return (ids || []).map((id) => String(id || '').trim()).filter(Boolean);
};

export const resolveActiveMemoryIds = (item: HistoryItem): string[] => {
  const memories = item.optimizationMemories || [];
  if (!memories.length) return [];

  const memoryIdSet = new Set(memories.map((memory) => memory.id));

  if (item.publishedVersionId && item.publishedVersions?.length) {
    const published = item.publishedVersions.find((version) => version.id === item.publishedVersionId);
    if (published) {
      return normalizeIds(published.memoryIds).filter((id) => memoryIdSet.has(id));
    }
  }

  return normalizeIds(item.activeMemoryIds).filter((id) => memoryIdSet.has(id));
};

export const applyOptimizationMemories = (
  baseAnalysis: AnalysisResult,
  memories: PromptOptimizationMemory[] | undefined,
  activeMemoryIds: string[] | undefined,
  language: PromptOutputLanguage,
): AnalysisResult => {
  const memoryList = memories || [];
  const activeSet = new Set(normalizeIds(activeMemoryIds));
  if (!memoryList.length || !activeSet.size) return baseAnalysis;

  const merged = cloneAnalysis(baseAnalysis);

  for (const memory of memoryList) {
    if (!activeSet.has(memory.id)) continue;
    if (memory.language !== language) continue;

    for (const key of DIMENSIONS) {
      const rewrite = String(memory.patch[key] || '').trim();
      if (!rewrite) continue;
      merged.structuredPrompts[key].original = rewrite;
    }
  }

  return merged;
};

export const buildMemoryPatchFromFeedback = (
  feedback: ExternalReviewFeedback,
): Partial<Record<DimensionKey, string>> => {
  const patch: Partial<Record<DimensionKey, string>> = {};

  for (const key of DIMENSIONS) {
    const rewrite = String(feedback.dimensions?.[key]?.rewrite || '').trim();
    if (!rewrite) continue;
    patch[key] = rewrite;
  }

  return patch;
};

export const buildOptimizationMemory = (params: {
  feedback: ExternalReviewFeedback;
  language: PromptOutputLanguage;
  title?: string;
}): PromptOptimizationMemory => {
  const { feedback, language, title } = params;
  const createdAt = Date.now();
  const safeTitle = String(title || '').trim() || `外部评审 ${new Date(createdAt).toLocaleString()}`;

  return {
    id: `mem-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    title: safeTitle,
    createdAt,
    language,
    source: 'external-review',
    overallSummary: feedback.overallSummary,
    keyIssues: feedback.keyIssues,
    feedback,
    patch: buildMemoryPatchFromFeedback(feedback),
  };
};
