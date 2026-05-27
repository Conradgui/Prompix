# Prompix 项目经历（单项目版，AI 产品经理）

## 中文完整版（按简历“项目经历”版式）
**Prompix｜AI 视觉提示词工作台**　　　　　　　　　　　　　　　　　　　　　　　　　　　　　**作品集项目**

- **背景介绍**：针对“视觉内容拆解不稳定、提示词复用效率低、演示场景易翻车”的问题，设计并落地从上传图片到结构化 Prompt 复用的闭环工具，面向创作者与面试演示场景提供开箱可用能力。
- **技术栈**：Next.js (App Router)、TypeScript、Tailwind CSS、Framer Motion、MiniMax API、Vercel、Vitest、Playwright、本地存储（IndexedDB/LocalStorage）。
- **项目实现**：
1. **运行策略分层**：定义 `RuntimeMode = demo | api` 与 `local/public-live/public-demo` 策略，平衡“公网可演示可用”与“本地可扩展调试”的产品边界。  
2. **结构化输出标准化**：将视觉分析统一为 `subject/environment/composition/lighting/mood/style` 六维结构，支持单语直出、语言变体缓存与历史回看复用。  
3. **术语库降本与可解释性优化**：设计术语预生成与本地缓存机制，新增术语独立追问线程与导入导出去重，降低重复请求成本并提升学习闭环体验。  
4. **稳定性治理**：将默认启动改为 stable 模式（build+start），隔离 dev/prod 产物目录（`.next`/`.next-dev`），升级健康检查为“页面 + CSS 资源可达”，解决二次启动样式崩溃问题。  
- **项目成果**：形成可验证的端到端闭环（6 个核心页面、6 条 managed API）；建立质量保障体系（25 个 unit test 文件 + 7 个 e2e 测试文件）；项目支持公网直链演示与本地一键稳定启动，显著提升展示成功率与迭代可控性。

## 中文精简两行版
主导 Prompix（视觉到提示词 AI 工具）从 0 到 1 产品化，落地上传分析-六维拆解-对话迭代-术语沉淀-历史复用的完整闭环。  
设计 `demo/api` 运行策略并完成启动稳定性治理（stable 默认、dev/prod 产物隔离、CSS 健康检查），实现公网可演示与本地可持续迭代。

## English Full Version (Project Section)
**Prompix | AI Visual-to-Prompt Workbench**　　　　　　　　　　　　　　　　　　　　　　**Portfolio Project**

- **Background**: Built an end-to-end product workflow to address unstable visual decomposition, poor prompt reusability, and unreliable demo performance in interview scenarios.
- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion, MiniMax API, Vercel, Vitest, Playwright, local persistence (IndexedDB/LocalStorage).
- **Execution**:
1. **Runtime policy design**: Defined `demo | api` modes with `local/public-live/public-demo` environments to balance usability, security boundaries, and demo readiness.  
2. **Structured output standardization**: Normalized analysis into six dimensions (subject, environment, composition, lighting, mood, style) with language variants and reusable history.  
3. **Cost + explainability optimization**: Implemented wordbank pre-generation/caching, per-term follow-up threads, and import/export deduplication for lower repeated calls and better learning flow.  
4. **Reliability engineering**: Switched default launch to stable mode, separated dev/prod build artifacts (`.next` vs `.next-dev`), and upgraded health checks to include CSS asset availability.
- **Outcome**: Delivered a production-like demo workflow (6 core pages, 6 managed APIs), with quality safeguards (25 unit test files + 7 e2e files), enabling stable public demos and efficient iteration.

## English Concise Version (2 lines)
Led Prompix from concept to a usable AI product loop: image upload, six-dimension prompt decomposition, iterative chat refinement, and reusable history/wordbank.  
Designed runtime policy and launch reliability mechanisms (stable default, artifact isolation, CSS-aware health checks) to ensure consistent demo readiness.

## 30 秒面试口径（中文）
我做的 Prompix 不是单纯“接模型”，而是把 AI 能力做成可用产品：从视觉输入到六维结构化 Prompt，再到术语追问和历史复用形成闭环。核心价值在于策略和稳定性设计，比如 `demo/api` 运行分层、术语缓存降本、以及启动稳定化治理，保证面试官点击链接就能直接演示。

## 可引用接口 / 类型（简历可写）
- 运行策略：`RuntimeMode = demo | api`，策略环境：`local/public-live/public-demo`。
- 核心接口：`/api/managed/analyze|chat|regenerate|explain-term|translate|term-followup`。
- 核心结构：`AnalysisResult`（六维结构化输出）、`HistoryItem`（语言变体与历史沉淀）。

## 内容质量校验清单
- 真实性：每条表述均可映射到仓库已实现能力，不包含“未上线/未实现”描述。  
- PM 维度覆盖：包含问题定义、用户价值、关键决策、落地执行、结果验证。  
- 可投递性：中文完整版为“1 段 + 4~6 点”，精简版 2 行，英文版采用产品语境而非直译。  
