export interface NormalizedModelOutput {
  finalText: string;
  thinkingText: string;
}

const THINK_TAG_REGEX = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const PREFIX_THINKING_REGEX = /^(?:\[|\(|（|【)?\s*(?:思考|推理|thinking|thought|reasoning)/i;

const normalizeLineBreaks = (value: string): string => {
  return (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

const cleanBlock = (value: string): string => {
  return normalizeLineBreaks(value)
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
};

const THINKING_NOISE_LINE_PATTERNS: RegExp[] = [
  /^user says[:：]?/i,
  /^the user wants/i,
  /^we need to/i,
  /^task[:：]?/i,
  /^analysis[:：]?/i,
  /^you are (an?|the)\s/i,
  /^你是(一名|一个)?/i,
  /^请解释术语/i,
  /^explain (the )?term/i,
  /^output only json/i,
  /^must (only )?output (a )?json/i,
  /^must return (a )?json/i,
  /^json output/i,
  /^json schema/i,
  /^json structure/i,
  /^必须只输出\s*json/i,
  /^必须只输出一个\s*json/i,
  /^json 结构固定为/i,
  /^约束[:：]?/i,
  /^\d+\.\s*(def|app|必须|禁止|仅输出|输出)/i,
  /^目标语言[:：]?/i,
  /^仅输出\s*json/i,
  /^输出\s*json/i,
];

const THINKING_NOISE_INLINE_PATTERNS: RegExp[] = [
  /仅输出\s*json/i,
  /output only json/i,
  /\"def\"/i,
  /\"app\"/i,
];

const shouldDropThinkingLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (THINKING_NOISE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    if (THINKING_NOISE_INLINE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  }

  return false;
};

export const sanitizeThinkingText = (value: string): string => {
  const cleaned = cleanBlock(value);
  if (!cleaned) return '';

  const lines = cleaned
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trimEnd())
    .filter((line) => !shouldDropThinkingLine(line));

  const deduped: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (deduped[deduped.length - 1] !== '') deduped.push('');
      continue;
    }
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }

  return cleanBlock(deduped.join('\n')).slice(0, 2400);
};

const splitPrefixedThinking = (value: string): { finalText: string; thinkingText: string } | null => {
  const normalized = cleanBlock(value);
  if (!normalized) return null;

  const parts = normalized.split(/\n{2,}/);
  if (parts.length < 2) return null;

  const firstBlock = cleanBlock(parts[0]);
  if (!firstBlock || !PREFIX_THINKING_REGEX.test(firstBlock)) return null;

  const finalText = cleanBlock(parts.slice(1).join('\n\n'));
  if (!finalText) return null;

  return {
    finalText,
    thinkingText: firstBlock,
  };
};

export const normalizeModelOutput = (raw: string): NormalizedModelOutput => {
  const original = normalizeLineBreaks(raw || '');
  if (!original.trim()) {
    return { finalText: '', thinkingText: '' };
  }

  const thinkingChunks: string[] = [];
  const textWithoutTags = original.replace(THINK_TAG_REGEX, (_match, _tag, content) => {
    const thinking = cleanBlock(String(content || ''));
    if (thinking) thinkingChunks.push(thinking);
    return '\n';
  });

  let finalText = cleanBlock(textWithoutTags);
  let thinkingText = cleanBlock(thinkingChunks.join('\n\n'));

  if (!thinkingText) {
    const prefixed = splitPrefixedThinking(finalText || original);
    if (prefixed) {
      finalText = prefixed.finalText;
      thinkingText = prefixed.thinkingText;
    }
  }

  // 某些模型会把有效内容完全包在 think 标签里，这里回退到思考文本防止丢失。
  if (!finalText && thinkingText) {
    finalText = thinkingText;
  }

  return {
    finalText,
    thinkingText: sanitizeThinkingText(thinkingText),
  };
};
