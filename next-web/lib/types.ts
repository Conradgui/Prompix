export interface UserSettings {
  persona: string;
  descriptionStyle: string; // e.g., "Standard", "Artistic", "Cinematic"
  cardFrontLanguage?: string; // Default 'EN'
  cardBackLanguage?: string; // Default 'CN'
  systemLanguage?: string; // Default 'EN'
  promptOutputLanguage?: PromptOutputLanguage; // 输出 prompt 语言
  copyIncludedModules?: string[]; // E.g., ['Subject', 'Style']
}

export type RuntimeMode = 'demo' | 'api';
export type PromptOutputLanguage = 'zh' | 'en';

export interface DeveloperModeState {
  authorized: boolean;
  source: 'local' | 'public';
  expiresAt: number | null;
}

export interface ApiConfig {
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  groupId: string;
  provider?: string;
}

export interface TermExplanation {
  def: string;
  app: string;
}

export interface ManagedMeta {
  thinking?: string;
}

export interface PromptSegment {
  original: string;
  translated: string;
}

export interface AnalysisResult {
  description: string;
  structuredPrompts: {
    subject: PromptSegment;
    environment: PromptSegment;
    composition: PromptSegment;
    lighting: PromptSegment;
    style: PromptSegment;
    mood: PromptSegment;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface TermFollowupMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  thinking?: string;
}

// Custom preset chip for chat
export interface CustomChip {
  id: string;
  label: string;
  prompt: string;
}

// ✅ 修改点：新增 'printer' 模式
export type AppMode = 'home' | 'analysis' | 'chat' | 'history' | 'settings' | 'printer';

// Dimension types
export type DimensionKey = 'subject' | 'environment' | 'composition' | 'lighting' | 'mood' | 'style';

export interface ExternalReviewFormInput {
  objective: string;
  constraints: string;
  knownIssues: string;
  priority: string;
  targetModels: string;
  dimensionFocus: Record<DimensionKey, string>;
}

export interface ExternalReviewDimensionFeedback {
  score: number;
  issues: string;
  rewrite: string;
  rationale: string;
}

export interface ExternalReviewFeedback {
  version: number;
  language: PromptOutputLanguage;
  overallSummary: string;
  keyIssues: string[];
  strategies: string[];
  dimensions: Record<DimensionKey, ExternalReviewDimensionFeedback>;
}

export interface ExternalReviewPackage {
  version: number;
  exportedAt: number;
  language: PromptOutputLanguage;
  imageDataUrl: string;
  baseAnalysis: AnalysisResult;
  form: ExternalReviewFormInput;
  instructionMarkdown: string;
  responseTemplate: ExternalReviewFeedback;
}

export interface PromptOptimizationMemory {
  id: string;
  title: string;
  createdAt: number;
  language: PromptOutputLanguage;
  source: 'external-review';
  overallSummary: string;
  keyIssues: string[];
  feedback: ExternalReviewFeedback;
  patch: Partial<Record<DimensionKey, string>>;
}

export interface PromptPublishVersion {
  id: string;
  name: string;
  createdAt: number;
  memoryIds: string[];
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  imageUrl: string;
  thumbnailUrl?: string; // Low-res base64 thumbnail for library list
  analysis: AnalysisResult;
  promptLanguage?: PromptOutputLanguage;
  analysisVariants?: Partial<Record<PromptOutputLanguage, AnalysisResult>>;
  isFavorite?: boolean;
  chatHistory?: ChatMessage[];
  read?: boolean;
  lastViewedAt?: number; // Timestamp of last view
  lastExported?: number; // Timestamp of last export
  dimensionHistories?: DimensionHistories; // Track regeneration history per dimension
  optimizationMemories?: PromptOptimizationMemory[];
  activeMemoryIds?: string[];
  publishedVersions?: PromptPublishVersion[];
  publishedVersionId?: string;
}

// History tracking for each dimension
export interface DimensionHistory {
  versions: PromptSegment[]; // Array of historical versions
  currentIndex: number; // Which version is currently displayed
}

export type DimensionHistories = {
  [K in DimensionKey]?: DimensionHistory;
};

export const DEFAULT_SETTINGS: UserSettings = {
  persona: "",
  descriptionStyle: "Standard",
  cardFrontLanguage: "English",
  cardBackLanguage: "Chinese",
  systemLanguage: "Chinese",
  promptOutputLanguage: "en",
  copyIncludedModules: ["Subject", "Environment", "Composition", "Lighting", "Mood", "Style"]
};
