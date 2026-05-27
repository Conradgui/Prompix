import {
  AnalysisResult,
  DimensionKey,
  ExternalReviewDimensionFeedback,
  ExternalReviewFeedback,
  ExternalReviewFormInput,
  ExternalReviewPackage,
  PromptOutputLanguage,
} from '../types';

const DIMENSIONS: DimensionKey[] = ['subject', 'environment', 'composition', 'lighting', 'mood', 'style'];

const DEFAULT_DIMENSION: ExternalReviewDimensionFeedback = {
  score: 7,
  issues: '',
  rewrite: '',
  rationale: '',
};

const clean = (value: unknown): string => String(value || '').trim();

const normalizeStringArray = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input.map((item) => clean(item)).filter(Boolean);
};

const buildResponseTemplate = (language: PromptOutputLanguage): ExternalReviewFeedback => {
  return {
    version: 1,
    language,
    overallSummary: '',
    keyIssues: [''],
    strategies: [''],
    dimensions: {
      subject: { ...DEFAULT_DIMENSION },
      environment: { ...DEFAULT_DIMENSION },
      composition: { ...DEFAULT_DIMENSION },
      lighting: { ...DEFAULT_DIMENSION },
      mood: { ...DEFAULT_DIMENSION },
      style: { ...DEFAULT_DIMENSION },
    },
  };
};

const getInstructionMarkdown = (language: PromptOutputLanguage): string => {
  const langNote = language === 'zh' ? '中文' : 'English';
  return [
    '# Prompix 外部评审指令（可直接粘贴给 GPT/Gemini）',
    '',
    '你将收到一个 Prompix 评审包（含原图、当前结构化 Prompt、问题表单）。',
    `请使用 ${langNote} 输出，并且只返回一个 JSON 对象，禁止输出解释、代码块或额外文本。`,
    '',
    '严格输出结构：',
    '```json',
    JSON.stringify(buildResponseTemplate(language), null, 2),
    '```',
    '',
    '评分要求：score 取值 1-10。',
    'rewrite 要可直接替换到对应维度 Prompt 中。',
    'issues 要具体指出问题，rationale 要说明改写依据。',
  ].join('\n');
};

export const buildExternalReviewPackage = (params: {
  language: PromptOutputLanguage;
  imageDataUrl: string;
  baseAnalysis: AnalysisResult;
  form: ExternalReviewFormInput;
}): ExternalReviewPackage => {
  const { language, imageDataUrl, baseAnalysis, form } = params;
  return {
    version: 1,
    exportedAt: Date.now(),
    language,
    imageDataUrl,
    baseAnalysis,
    form,
    instructionMarkdown: getInstructionMarkdown(language),
    responseTemplate: buildResponseTemplate(language),
  };
};

const dataUrlToBlob = (dataUrl: string): { blob: Blob; ext: string } => {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    throw new Error('图片数据格式无效，无法导出 ZIP。');
  }

  const mime = match[1] || 'image/jpeg';
  const bytes = atob(match[2]);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);

  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return {
    blob: new Blob([buffer], { type: mime }),
    ext,
  };
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadExternalReviewJson = (pkg: ExternalReviewPackage): void => {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `prompix_review_package_${pkg.exportedAt}.json`);
};

export const downloadExternalReviewZip = async (pkg: ExternalReviewPackage): Promise<void> => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const { blob: imageBlob, ext } = dataUrlToBlob(pkg.imageDataUrl);

  zip.file('prompix_review_package.json', JSON.stringify(pkg, null, 2));
  zip.file('external_ai_instruction.md', pkg.instructionMarkdown);
  zip.file('external_ai_response_template.json', JSON.stringify(pkg.responseTemplate, null, 2));
  zip.file(`reference_image.${ext}`, imageBlob);

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `prompix_review_bundle_${pkg.exportedAt}.zip`);
};

const tryParse = (raw: string): any | null => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const extractCodeBlockJson = (text: string): string[] => {
  const blocks: string[] = [];
  const regex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match[1]) blocks.push(match[1].trim());
  }
  return blocks;
};

const extractFirstBalancedObject = (text: string): string | null => {
  const source = text || '';
  let depth = 0;
  let start = -1;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return source.slice(start, i + 1);
      }
      if (depth < 0) {
        depth = 0;
        start = -1;
      }
    }
  }

  return null;
};

const normalizeDimensionFeedback = (value: any): ExternalReviewDimensionFeedback => {
  const scoreNum = Number(value?.score);
  const score = Number.isFinite(scoreNum) ? Math.max(1, Math.min(10, Math.round(scoreNum))) : 0;

  return {
    score,
    issues: clean(value?.issues),
    rewrite: clean(value?.rewrite),
    rationale: clean(value?.rationale),
  };
};

export const validateExternalReviewFeedback = (
  raw: any,
  fallbackLanguage: PromptOutputLanguage,
): { ok: true; data: ExternalReviewFeedback } | { ok: false; error: string } => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '评审结果不是有效 JSON 对象。' };
  }

  const language = raw.language === 'zh' || raw.language === 'en' ? raw.language : fallbackLanguage;

  const dimensions = {} as Record<DimensionKey, ExternalReviewDimensionFeedback>;
  for (const key of DIMENSIONS) {
    const dim = normalizeDimensionFeedback(raw.dimensions?.[key]);
    if (!dim.issues || !dim.rewrite) {
      return { ok: false, error: `维度 ${key} 缺少 issues 或 rewrite。` };
    }
    if (!dim.score) {
      return { ok: false, error: `维度 ${key} 的 score 必须是 1-10。` };
    }
    dimensions[key] = dim;
  }

  const overallSummary = clean(raw.overallSummary);
  if (!overallSummary) {
    return { ok: false, error: 'overallSummary 不能为空。' };
  }

  const keyIssues = normalizeStringArray(raw.keyIssues);
  const strategies = normalizeStringArray(raw.strategies);

  if (!keyIssues.length || !strategies.length) {
    return { ok: false, error: 'keyIssues 与 strategies 至少各包含一条。' };
  }

  return {
    ok: true,
    data: {
      version: Number(raw.version) || 1,
      language,
      overallSummary,
      keyIssues,
      strategies,
      dimensions,
    },
  };
};

export const parseExternalReviewFeedbackFromText = (
  text: string,
  fallbackLanguage: PromptOutputLanguage,
): { ok: true; data: ExternalReviewFeedback } | { ok: false; error: string } => {
  const rawText = (text || '').trim();
  if (!rawText) {
    return { ok: false, error: '请输入外部评审结果。' };
  }

  const candidates: string[] = [rawText, ...extractCodeBlockJson(rawText)];
  const balanced = extractFirstBalancedObject(rawText);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (!parsed) continue;
    return validateExternalReviewFeedback(parsed, fallbackLanguage);
  }

  return { ok: false, error: '未找到可解析的 JSON，请检查外部 AI 输出格式。' };
};
