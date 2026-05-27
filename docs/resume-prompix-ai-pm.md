# Prompix 简历化梳理包（AI 产品经理）

> 单项目简历条目（按项目经历版式可直接粘贴）：[resume-prompix-project-section.md](/Users/conrad/Desktop/Codex%20vibe%20coding/Prompix/docs/resume-prompix-project-section.md)

## 1) 项目事实基线（可验证）
- 项目定位：从视觉内容到结构化提示词的 AI 工具，支持分析、追问、历史沉淀、术语学习与导出复用。
- 主工程：`next-web/`（Next.js App Router + Tailwind + Framer Motion）。
- 核心页面：`/`、`/analysis`、`/library`、`/wordbank`、`/settings`、`/dev-lab`（共 6 页）。
- 核心接口：`/api/managed/analyze|chat|regenerate|explain-term|translate|term-followup`（6 条）。
- 关键结构：`RuntimeMode = demo | api`，运行策略 `local/public-live/public-demo`；`AnalysisResult` 六维结构（subject/environment/composition/lighting/mood/style）。
- 可量化质量保障：`25` 个 unit test 文件 + `7` 个 e2e 测试文件；关键链路覆盖上传、分析、历史、术语、设置、启动稳定性。
- 启动稳定化：默认 stable（build + start），dev/stable 产物隔离（`.next` / `.next-dev`），受管进程独立 PID+日志，健康检查包含 CSS 资源可访问性。

## 2) 证据词典（简历说法 -> 代码事实）
| 简历表达 | 代码事实锚点 |
|---|---|
| 设计并落地“可开箱演示”的 AI Prompt 产品闭环 | 6 页面路由 + managed API 链路，公网可演示，本地免复杂配置启动 |
| 主导运行模式策略与体验边界 | `RuntimeMode demo/api` + `public-demo` 下 API 模式限制策略 |
| 将视觉分析标准化为 6 维结构，支持中英输出与历史复用 | `AnalysisResult` 六维结构 + 语言变体缓存 `analysisVariants` |
| 提升可用性与稳定性，降低“二次打开样式崩溃”风险 | stable/dev 分离、PID 管理、CSS 健康检查 |
| 建立术语学习与追问机制，增强用户理解深度 | 术语解释缓存、术语追问线程、导入导出与去重合并 |
| 用测试保障核心链路，支持持续迭代 | Vitest + Playwright 覆盖主流程与回归场景 |

## 3) 中文简历版本（可直接粘贴）

### 3.1 完整版（AI 产品经理）
**Prompix｜AI 视觉提示词产品（作品集项目）**  
定位：面向创作者的“视觉到提示词”工作台，将图片拆解为可复现的结构化 Prompt，并支持迭代优化与本地资料沉淀。

- 负责从 0 到 1 定义产品闭环：上传分析、6 维拆解、对话微调、历史库、术语库、设置策略，形成“可演示可复用”的端到端体验。  
- 设计运行策略 `demo/api` 与 `public-live/public-demo/local` 环境边界，在保证公网可用的同时控制安全与配置复杂度。  
- 推动稳定性优化：将默认启动改为 stable 模式，拆分 dev/prod 构建产物并加入样式健康检查，解决二次打开后结构与样式异常问题。  
- 主导术语库体验迭代：引入顺序预生成与本地缓存、术语独立追问线程、JSON 导入导出与去重合并，降低重复请求成本并增强可解释性。  
- 建立质量保障机制：通过 Vitest 与 Playwright 覆盖分析主链路与关键回归场景，支撑功能持续迭代和面试场景稳定演示。  

### 3.2 精简两行版（高密度）
主导 Prompix（视觉到提示词 AI 工具）从 0 到 1 产品化，落地上传分析-6 维拆解-对话迭代-术语学习-历史沉淀的完整闭环。  
设计 `demo/api` 运行策略与公网可用边界，完成启动稳定化与缓存降本，形成可演示、可复用、可持续迭代的 AI 产品样板。

## 4) 英文辅版（英文简历/平台）
**Prompix | AI Visual-to-Prompt Workbench (Portfolio Project)**  
Led product definition and delivery of an end-to-end workflow that converts images into reusable 6-dimension prompts, with iterative chat refinement, term learning, and local knowledge retention.

- Defined runtime policies (`demo/api`, `local/public-live/public-demo`) to balance usability, security boundaries, and zero-friction interview demos.  
- Drove reliability improvements by introducing stable-by-default launch flow, dev/prod build isolation, and CSS-aware health checks to eliminate repeated startup style failures.  
- Shipped a cost-aware wordbank experience with pre-generation, per-term follow-up threads, and JSON import/export with deduplication for portable personal prompt libraries.  

## 5) 面试口径包

### 5.1 30 秒电梯稿
我做了一个 AI 产品经理导向的项目叫 Prompix，核心是把图片自动拆成可复现文生图的 6 维提示词，再通过对话和术语库不断迭代。项目重点不是“接了模型”，而是把可用性做完整：运行策略、稳定启动、缓存降本、导入导出和测试回归都闭环了，面试官点开链接可以直接用。

### 5.2 90 秒 STAR 讲法
**S（情境）**：市面上很多视觉分析工具能“生成答案”，但不稳定、不可复用、且演示时容易翻车。  
**T（任务）**：做一个可开箱演示、可持续迭代的 AI 产品样板，服务创作者从“看图”到“可复现 Prompt”。  
**A（行动）**：我定义了 6 维结构输出标准，设计 `demo/api` + 多环境运行策略，落地历史沉淀与术语追问；针对启动崩样式问题，把默认模式切到 stable、隔离 dev/prod 产物，并把健康检查从“页面 200”提升到“样式资源可达”。  
**R（结果）**：产品形成完整闭环，公网可直接演示；关键回归有自动化测试兜底，迭代效率和面试可展示性显著提升。  

### 5.3 高频追问标准回答（3 个）
**Q1：为什么选 MiniMax，而不是继续 OpenAI？**  
A：这是产品约束下的决策。目标是“面试可开箱演示”，我优先选择当时可用、成本可控、并能支持文本图像输入链路的方案，同时保留 `api` 模式做扩展入口，避免绑定单一供应商。  

**Q2：你怎么控制成本与稳定性？**  
A：两层做法。产品层通过术语预生成缓存、线程复用、导入导出减少重复调用；工程层通过运行策略分层、启动稳定化、健康检查和回归测试降低故障率。  

**Q3：这个项目最体现你 PM 能力的点是什么？**  
A：我把“模型能力”翻译成“可用产品能力”：明确用户任务流、定义结构化输出标准、设置运行边界、做可靠性治理，并用测试与验收标准把迭代机制建立起来。  

## 6) AI PM JD 关键词映射
| JD 关键词 | Prompix 可对应表述 |
|---|---|
| 需求分析 / 用户洞察 | 面向创作者定义“视觉复现”核心任务流，拆解为上传-分析-迭代-沉淀 |
| PRD 与功能拆解 | 将能力模块化为分析、历史、术语、设置、开发者调优 |
| AI 能力集成 | 设计 managed API 链路与模型适配层，保障可替换与可演示 |
| 策略与权衡 | `demo/api` 与 `public-live/public-demo/local` 策略分层 |
| 指标意识 / 质量意识 | 以可量化工程指标替代业务数据：接口数、测试覆盖、故障收敛 |
| 跨职能协同 | 可表述为“产品决策驱动前后端实现与测试验收闭环” |

## 7) 两档语气模板

### 稳健版（保守可信）
- 主导 AI 工具产品化梳理与核心流程设计，完成从分析到沉淀的闭环。  
- 在可用性和稳定性上持续优化，保证演示与回归的一致性。  
- 通过策略分层与测试覆盖降低风险，提升迭代效率。  

### 进取版（Ownership）
- 从 0 到 1 负责 Prompix 产品策略与落地，定义结构标准、运行边界与体验路线图。  
- 主导解决关键稳定性故障，重构启动体系并建立健康检查机制，显著提升可演示可靠性。  
- 搭建“分析-追问-沉淀-迁移”闭环，形成可复用的 AI 产品方法样板。  

---
可直接使用建议：
- 校招/社招简历正文用“3.1 完整版”或“3.2 精简版”。  
- 英文平台同步贴“4 英文辅版”。  
- 面试前背熟“5 面试口径包”中的 30 秒 + 90 秒版本。  
