import { UserSettings } from '../../types';

const DIMENSION_SCHEMA = `{
  "structuredPrompts": {
    "subject": { "original": "...", "translated": "..." },
    "environment": { "original": "...", "translated": "..." },
    "composition": { "original": "...", "translated": "..." },
    "lighting": { "original": "...", "translated": "..." },
    "mood": { "original": "...", "translated": "..." },
    "style": { "original": "...", "translated": "..." }
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
  const targetLang = settings.cardBackLanguage || (frontLang === 'Chinese' ? 'English' : 'Chinese');

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
    '- subject (主体) 与 environment (环境)：请使用精简紧凑的视觉短句描述（避免在 original 中使用 "which is", "standing on the side of", "looks like" 等口语化介词与被动语态，将从句改为更直接的修饰语叠加，例如将 "a boy who is sitting on a chair" 改为 "a boy sitting on a wooden chair"）。句数控制在 2-3 句，禁止只写单词。',
    '- composition (构图)、lighting (光照)、mood (情绪) 与 style (风格)：必须使用英文逗号分隔的词组/短语形式（建议 6-12 个词组），不写完整句子。',
    '- 当分析特定视觉风格（style）时，必须在构图、光照或风格字段中智能追加相应的技术参数：',
    '  * 若为写实摄影或电影级画面（Photorealistic / Cinematic / Realistic）：必须追加相机镜头参数（例如 35mm photograph, shot on Hasselblad, f/1.8 aperture, cinematic color grading）。',
    '  * 若为动漫或卡通插画（Anime / Cartoon / Illustration）：必须追加二次元技术术语（例如 sharp focus, precise cell shading, digital illustration, anime style）。',
    '  * 若为 3D 渲染画面（3D Render）：必须追加渲染词汇（例如 Unreal Engine 5 render, global illumination, ray tracing, octane render）。',
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
  const targetLang = settings.cardBackLanguage || (frontLang === 'Chinese' ? 'English' : 'Chinese');
  const label = DIMENSION_LABELS[dimension] || dimension;
  const isTagDimension = ['composition', 'lighting', 'mood', 'style'].includes(dimension);

  const formatRule = isTagDimension
    ? 'original 字段必须为逗号分隔的短语词组（至少 6 项），不写完整段落。'
    : 'original 字段请使用精简紧凑的视觉短句描述（避免使用 "which is", "standing on the side of", "looks like" 等口语化介词与被动语态，将从句改为更直接的修饰语叠加，例如将 "a boy who is sitting on a chair" 改为 "a boy sitting on a wooden chair"，句数控制在 2-3 句）。';

  return [
    '你是 Prompix 的视觉提示词拆解助手。',
    `当前仅重生和修改维度：${label}。`,
    `输出语言要求：`,
    `1. "original" 字段必须是 ${frontLang}。`,
    `2. "translated" 字段必须是对应的 ${targetLang} 翻译，不能为空。`,
    formatRule,
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

/**
 * Prompt for explaining visual styles/terms in Wordbank
 */
export const getExplainTermPrompt = (term: string, language: string) => {
  return [
    `As an expert Art Director, explain the visual style or term: "${term}".`,
    `Target Language: ${language} (You MUST respond in this language).`,
    `Rules:`,
    `1. Keep it VERY concise, optimized for a mobile/small viewport card display.`,
    `2. "def": Pure definition, characteristics, and historical background of the style (Max 80 words).`,
    `3. "app": Recommended usage, combinations, and negative guidelines when writing generator prompts (Max 80 words).`,
    `4. Guardrails: If "${term}" is NOT a real artistic style, art movement, design trend, historical technique, photographic parameter, or valid AI generator keyword, or if you are unsure of its true definition, you MUST set "def" to "Unrecognized or general visual concept." and "app" to "Use as a generic descriptive keyword in prompt construction." Do NOT fabricate or invent non-existent artistic concepts, histories, or definitions.`,
    `Output strictly JSON structure, no extra characters or markdown blocks:`,
    `{ "def": "...", "app": "..." }`
  ].join('\n');
};
