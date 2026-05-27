import { AnalysisResult, DimensionKey, PromptSegment } from '../types';

export const DIMENSION_ORDER: DimensionKey[] = [
  'subject',
  'environment',
  'composition',
  'lighting',
  'mood',
  'style',
];

const hasText = (value?: string | null): boolean => {
  return Boolean(value && value.trim().length > 0);
};

export const hasSegmentOriginal = (segment?: Partial<PromptSegment> | null): boolean => {
  return hasText(segment?.original || '');
};

export const getMissingDimensions = (analysis?: AnalysisResult | null): DimensionKey[] => {
  if (!analysis) return [...DIMENSION_ORDER];

  return DIMENSION_ORDER.filter((key) => !hasSegmentOriginal(analysis.structuredPrompts?.[key]));
};

