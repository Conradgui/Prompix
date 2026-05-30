import { DimensionKey, PromptSegment } from '../types';

export function compilePromptSegment(
  text: string,
  weight: number,
  format: 'structured' | 'mj' | 'sd' | 'dalle' | 'plain'
): string {
  if (!text) return '';
  if (weight === 1.0 || format === 'plain' || format === 'structured') {
    return text;
  }
  if (format === 'mj') {
    return `${text}::${weight.toFixed(1)}`;
  }
  if (format === 'sd' || format === 'dalle') {
    return `(${text}:${weight.toFixed(1)})`;
  }
  return text;
}

export function compileFullPrompt(
  enabledKeys: DimensionKey[],
  structuredPrompts: Record<string, PromptSegment>,
  dimensionWeights: Record<string, number>,
  format: 'structured' | 'mj' | 'sd' | 'dalle' | 'plain',
  mjParams: string,
  negativePrompt: string,
  getEnglishText: (seg: PromptSegment) => string,
  getLabel: (key: DimensionKey) => string
): string {
  if (format === 'structured') {
    return enabledKeys
      .map((key) => {
        const label = getLabel(key);
        const seg = structuredPrompts[key];
        return `[${label}]\n${seg?.original || ''}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  const parts = enabledKeys.map((key) => {
    const seg = structuredPrompts[key];
    if (!seg) return '';
    const val = getEnglishText(seg);
    const weight = dimensionWeights[key] ?? 1.0;
    return compilePromptSegment(val, weight, format);
  }).filter(Boolean);

  if (format === 'mj') {
    return parts.join(', ') + mjParams;
  }
  if (format === 'sd') {
    const positive = parts.join(', ');
    return `【Positive Prompt】\n${positive}\n\n【Negative Prompt】\n${negativePrompt}`;
  }
  if (format === 'dalle') {
    return parts.join('. ');
  }
  if (format === 'plain') {
    return enabledKeys
      .map((key) => {
        const seg = structuredPrompts[key];
        return seg?.original || '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}
