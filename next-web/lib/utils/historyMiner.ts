// src/utils/historyMiner.ts
import { HistoryItem } from '../types';

export type TermCategory = 'subject' | 'environment' | 'composition' | 'lighting' | 'mood' | 'style';

// 定义挖掘出的“知识点”结构
export interface MiningResult {
  term: string;      // 术语 (例如 "Cyberpunk")
  category: TermCategory;  // 分类（与分析结构对齐）
  images: string[];  // 关联的所有历史图片 URL 列表
  isPreset: boolean; // 是否是预设兜底数据 (没有历史图时为 true)
  presetId?: string; // 如果是预设，记录 ID 以便调用 CSS 样式
}
const COMMON_NOISE_PHRASES = [
  'in the background', 'on the left', 'on the right', 'in the foreground',
  'a portrait of', 'close up shot of', 'a view of', 'standing on',
  'looking at', 'sitting on', 'decorated with', 'featuring a',
  'which is', 'standing in front of', 'looking directly at the camera'
];

export const isPureVisualTerm = (tag: string): boolean => {
  const clean = tag.toLowerCase().trim();
  
  // 1. 过滤空以及停用词/过渡词
  if (!clean || COMMON_NOISE_PHRASES.some(noise => clean === noise || clean.includes(noise))) {
    return false;
  }
  
  // 2. 过滤纯数字 (如 8k/4k 会作为名词保留，但纯数 "1", "2" 过滤)
  if (/^\d+$/.test(clean)) {
    return false;
  }
  
  // 3. 过滤单字母/冠词等常见噪词
  if (['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'with', 'at'].includes(clean)) {
    return false;
  }
  
  return true;
};

export const adjustCategory = (tag: string, defaultCat: TermCategory): TermCategory => {
  const text = tag.toLowerCase().trim();
  
  // 判定是否是构图 (Composition) 技术细节：
  // 1. 比例关键字 (16:9, 4:3, aspect ratio 等)
  // 2. 分辨率关键字 (8k, 4k, resolution, hd 等)
  // 3. 相机摄影技术术语 (aperture, lens, hasselblad, canon, 光圈, 镜头 等)
  const isComposition = 
    text.includes('16:9') ||
    text.includes('4:3') ||
    text.includes('9:16') ||
    text.includes('21:9') ||
    text.includes('3:2') ||
    text.includes('画幅') ||
    text.includes('比例') ||
    text.includes('aspect ratio') ||
    text.includes('ar ') ||
    text.includes('纵横比') ||
    text.includes('8k') ||
    text.includes('4k') ||
    text.includes('16k') ||
    text.includes('resolution') ||
    text.includes('超清') ||
    text.includes('高清') ||
    text.includes('hd') ||
    text.includes('uhd') ||
    text.includes('aperture') ||
    text.includes('shutter') ||
    text.includes('光圈') ||
    text.includes('快门') ||
    text.includes('hasselblad') ||
    text.includes('canon') ||
    text.includes('nikon') ||
    text.includes('sony') ||
    text.includes('f/') ||
    text.includes('镜头') ||
    text.includes('photograph') ||
    text.includes('shot on');

  if (isComposition) {
    return 'composition';
  }

  return defaultCat;
};

/**
 * 核心挖掘机函数
 * @param items 从数据库读出的历史记录列表
 */
export const mineHistory = (items: HistoryItem[]): MiningResult[] => {
  // 使用 Map 来去重 (Key: 小写术语, Value: 结果对象)
  const termMap = new Map<string, MiningResult>();

  // --- 1. 开始挖掘历史记录 ---
  items.forEach(item => {
    const sp = item.analysis.structuredPrompts;
    if (!sp) return;

    // 恢复对主体 (subject) 和环境 (environment) 维度的短句/视觉词汇挖掘
    const categories: Partial<Record<TermCategory, string | undefined>> = {
      subject: sp.subject?.original,
      environment: sp.environment?.original,
      style: sp.style?.original,
      lighting: sp.lighting?.original,
      composition: sp.composition?.original,
      mood: sp.mood?.original,
    };

    // 遍历每个维度
    Object.entries(categories).forEach(([cat, text]) => {
      if (!text || typeof text !== 'string') return;

      const tags = text
        .split(/[,，.。;；\n]/)
        .map((t) => t.trim())
        // 过滤空串，并剔除过长或过短的噪音句子，以及非专业术语
        .filter((t) => t.length >= 2 && t.length <= 35 && isPureVisualTerm(t));

      tags.forEach(tag => {
        // 转小写作为唯一键，防止 "Cyberpunk" 和 "cyberpunk" 被当成两个
        const key = tag.toLowerCase();

        if (!termMap.has(key)) {
          termMap.set(key, {
            term: String(tag), // Ensure it is always a string
            category: adjustCategory(tag, cat as TermCategory),
            images: [],
            isPreset: false
          });
        }

        // 将当前图片加入该词条 (避免重复添加同一张图)
        const entry = termMap.get(key)!;
        if (!entry.images.includes(item.imageUrl)) {
          entry.images.push(item.imageUrl);
        }
      });
    });
  });

  // 将 Map 转为数组
  const results = Array.from(termMap.values());

  // --- 2. 稳定排序 ---
  // 先展示真实挖掘结果，再展示预设；真实结果按关联图片数量降序，最后按术语字母序稳定排序
  return results.sort((a, b) => {
    if (a.isPreset !== b.isPreset) {
      return a.isPreset ? 1 : -1;
    }

    if (a.images.length !== b.images.length) {
      return b.images.length - a.images.length;
    }

    return a.term.localeCompare(b.term, 'zh-Hans-CN');
  });
};
