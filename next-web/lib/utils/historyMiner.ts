// src/utils/historyMiner.ts
import { HistoryItem } from '../types';
import { AESTHETIC_TERMS } from '../data/aestheticTerms';

export type TermCategory = 'subject' | 'environment' | 'composition' | 'lighting' | 'mood' | 'style';

// 定义挖掘出的“知识点”结构
export interface MiningResult {
  term: string;      // 术语 (例如 "Cyberpunk")
  category: TermCategory;  // 分类（与分析结构对齐）
  images: string[];  // 关联的所有历史图片 URL 列表
  isPreset: boolean; // 是否是预设兜底数据 (没有历史图时为 true)
  presetId?: string; // 如果是预设，记录 ID 以便调用 CSS 样式
}

const normalizePresetCategory = (category: string | undefined): TermCategory => {
  const v = (category || '').trim().toLowerCase();
  if (v.includes('subject') || v.includes('主体')) return 'subject';
  if (v.includes('environment') || v.includes('环境')) return 'environment';
  if (v.includes('composition') || v.includes('构图')) return 'composition';
  if (v.includes('lighting') || v.includes('光')) return 'lighting';
  if (v.includes('mood') || v.includes('情绪')) return 'mood';
  return 'style';
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

    // 我们只挖掘这几个维度的词，排除可能包含长句的主体 (subject) 和环境 (environment)
    const categories: Partial<Record<TermCategory, string | undefined>> = {
      style: sp.style?.original,
      lighting: sp.lighting?.original,
      composition: sp.composition?.original,
      mood: sp.mood?.original,
    };

    // 遍历每个维度
    Object.entries(categories).forEach(([cat, text]) => {
      if (!text || typeof text !== 'string') return;

      // 按逗号分割，清理空格 (例如 "Neon lights, Rain" -> ["Neon lights", "Rain"])
      const tags = text
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2);

      tags.forEach(tag => {
        // 转小写作为唯一键，防止 "Cyberpunk" 和 "cyberpunk" 被当成两个
        const key = tag.toLowerCase();

        if (!termMap.has(key)) {
          termMap.set(key, {
            term: String(tag), // Ensure it is always a string
            category: cat as TermCategory,
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
  let results = Array.from(termMap.values());

  // --- 2. 兜底策略 (冷启动) ---
  // 如果挖掘出的词太少 (比如新用户，或者历史记录很少)，混入我们的预设词库
  // 这样保证打印机总有东西可以打
  if (results.length < 5) {
    const presets = AESTHETIC_TERMS.map(t => ({
      term: t.languages.English.term, // 默认用英文名作为 Key
      category: normalizePresetCategory(t.category),
      images: [], // 预设词没有历史图片
      isPreset: true,
      presetId: t.id
    }));

    // 合并：优先保留挖掘出的真实数据，不足的用预设补齐
    // (简单的去重合并逻辑)
    const existingTerms = new Set(results.map(r => r.term.toLowerCase()));
    const nonDuplicatePresets = presets.filter(p => !existingTerms.has(p.term.toLowerCase()));

    results = [...results, ...nonDuplicatePresets];
  }

  // --- 3. 稳定排序 ---
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
