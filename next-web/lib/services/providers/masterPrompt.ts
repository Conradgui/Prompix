import { UserSettings } from '../../types';

const DIMENSION_SCHEMA = `{
  "description": "...",
  "structuredPrompts": {
    "subject": { "original": "...", "translated": "" },
    "environment": { "original": "...", "translated": "" },
    "composition": { "original": "...", "translated": "" },
    "lighting": { "original": "...", "translated": "" },
    "mood": { "original": "...", "translated": "" },
    "style": { "original": "...", "translated": "" }
  }
}`;

const DIMENSION_LABELS: Record<string, string> = {
  subject: 'Subject（主体）',
  environment: 'Environment（环境）',
  composition: 'Composition（构图）',
  lighting: 'Lighting（光照）',
  mood: 'Mood（情绪）',
  style: 'Style（风格）',
};

const resolveFrontLanguage = (settings: UserSettings): string => {
  return settings.cardFrontLanguage || 'English';
};

/**
 * Master analysis prompt (balanced speed profile)
 * - 单语直出优先：只要求 original 字段，translated 固定留空
 * - 保留 6 维结构约束，减少冗长描述以提升响应速度
 */
export const getMasterAnalysisPrompt = (settings: UserSettings) => {
  const frontLang = resolveFrontLanguage(settings);
  const targetLang = (settings.systemLanguage === 'English') ? 'English' : 'Chinese';

  return [
    '你是 Prompix 的视觉提示词拆解引擎。请分析上传的图像并生成符合 Midjourney/Stable Diffusion 要求的结构化生图提示词。',
    `输出语言要求：`,
    `1. 所有 "original" 字段必须使用 "${frontLang}"。`,
    `2. 所有 "translated" 字段必须翻译为 "${targetLang}"（请提供准确、诗意且自然的对照翻译，不能为空字符串 ""）。`,
    '你必须只输出标准的 JSON，绝对不能输出 Markdown 代码块、说明性文字或任何 HTML 标签。',
    'JSON 结构必须严格匹配下方的 Schema：',
    DIMENSION_SCHEMA,
    '内容与格式规则：',
    '- 6个维度的 original 与 translated 字段都必须充满，不得返回空值。',
    '- subject (主体) 与 environment (环境)：必须使用 2-4 句的自然语言长句描述，包含极具画面可复现性的细节，禁止只写单词。',
    '- composition (构图)、lighting (光照)、mood (情绪) 与 style (风格)：必须使用英文逗号分隔的词组/短语形式（建议 6-12 个词组），不写完整句子。',
    '- 必须客观描述图像，不得虚构未出现的品牌、人物名字或外部设定。',
    `当前视觉风格偏好：${settings.descriptionStyle || 'Standard'}。`,
    `当前角色设定偏好：${settings.persona || 'General'}。`,
  ].join('\n');
};

/**
 * Focused prompt for regenerating one dimension
 */
export const getDimensionPrompt = (
  dimension: 'subject' | 'environment' | 'composition' | 'lighting' | 'mood' | 'style',
  settings: UserSettings,
) => {
  const frontLang = resolveFrontLanguage(settings);
  const targetLang = (settings.systemLanguage === 'English') ? 'English' : 'Chinese';
  const label = DIMENSION_LABELS[dimension] || dimension;
  const isTagDimension = ['composition', 'lighting', 'mood', 'style'].includes(dimension);

  const formatRule = isTagDimension
    ? 'original 字段必须为逗号分隔的短语词组（至少 6 项），不写完整段落。'
    : 'original 字段必须为 2-4 句自然语言描述，包含关键可复现细节。';

  return [
    '你是 Prompix 的视觉提示词拆解助手。',
    `当前仅重生和修改维度：${label}。`,
    `输出语言要求：`,
    `1. "original" 字段必须是 ${frontLang}。`,
    `2. "translated" 字段必须是对应的 ${targetLang} 翻译，不能为空。`,
    formatRule,
    '必须且只能输出如下格式 of JSON 对象，禁止输出任何额外文本：',
    '{ "original": "...", "translated": "..." }',
  ].join('\n');
};

/**
 * Prompt for translation utility
 */
export const getTranslationPrompt = (text: string, language: string) => {
  return `Translate the following text to ${language}.
Rules:
1. Maintain the original tone and style.
2. If it's a list of tags, keep it as comma-separated tags.
3. If it's a sentence, keep it as natural sentences.
4. Output specific art terminology correctly in the target language.

Text to translate:
"${text}"

Output ONLY JSON: { "translated": "YOUR_TRANSLATION_HERE" }`;
};
