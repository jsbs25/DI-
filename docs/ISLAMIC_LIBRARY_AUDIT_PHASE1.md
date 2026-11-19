# EARTH ONE 伊斯兰世界图书馆 - Phase 1 技术审查报告

- 审查时间：2026-11-19
- 范围：`earthone/`（当前运行代码副本，含本地 `.env`/数据文件；`earthone/.git` 存在，本地有未提交修改）
- 目标：对照《伊斯兰世界图书馆全面升级计划》检查现有架构、AI 接入、阅读引擎与数据能力，识别差距并给出分阶段实施建议。

## 1. 总体结论

- 现有项目已具备基础：图书搜索/发现与馆藏导入、PDF/EPUB/文本阅读器组件、书架与注释/进度数据结构、基于 `@google/genai` 的 Gemini 客户端封装，以及部分图书馆 AI 能力（PDF 本页讲解/点词查义、文本选段证据化解读）。
- **尚未达到“专业 AI 数字图书馆”目标**：AI 能力分散、未统一为 Library AI Service/`/api/library-ai/*`，缺少翻译/章节总结/阅读问答/分析/统一 OCR 接口与严格书籍上下文绑定；PDF 阅读器为自研 pdfjs canvas（非 Mozilla viewer 全功能集成），缺少目录大纲/缩略图/旋转/连续滚动/双页/阅读状态持久化等专业能力；EPUB AI 不可用；扫描版仅有有限视觉回退，无 Tesseract OCR 管线；RTL/阿语排版与混排未系统化。
- **Gemini**：服务端可通过 `server/geminiClient.ts` 读取 `GEMINI_API_KEY`/`GOOGLE_API_KEY` 或 `oneAiDb` 中 `gemini` 凭据创建客户端；`earthone/.env` 已配置 `GEMINI_API_KEY`（本地，gitignored）。但“真实接入”需在运行实例中验证实际调用成功、模型可用性与错误可观测性；部分 AI 路径仍依赖 oneAiRouter/aiGateway 回退，本次已修复本地回退与错误透传缺陷（见 §3.4）。

## 2. 现有架构与关键文件

### 2.1 技术栈（`earthone/package.json`）
- 前端：React 19、TypeScript、Vite 8、Tailwind 4
- 后端：Express + `tsx server.ts`（同进程全栈）
- AI/阅读相关依赖：`@google/genai` ^3.3.0、`pdfjs-dist` ^6.5.438、`epubjs` ^0.3.93
- 未见：`tesseract.js`/本地 `tesseract` 集成依赖、PDF.js viewer 应用封装依赖

### 2.2 前端图书馆与阅读器（`earthone/src/components/library/`, `earthone/src/components/browser/`）
| 组件 | 职责 | 现状要点 |
|---|---|---|
| `DigitalLibrary.tsx` | 图书馆主入口（home/search/detail/shelf/noor/admin）、打开阅读器 | 按格式分流：文本章节书→`AppleBookReader`，EPUB→`EpubReader`，PDF→`PdfDocumentViewer`；含馆藏搜索/导入/书架/管理员视图；阅读状态与 AI 交互部分分散在子组件 |
| `AppleBookReader.tsx` | 文本/章节书阅读（Apple Books 风格） | 自分页、主题/字体/字号/行高/布局、书签/高亮/笔记、朗读、选段 AI 解读（`/api/library/books/:id/ai-reading`）、本页讲解与查词（`/api/library/ai/*`）；进度/标注回调存在但需核对与后端持久化一致性 |
| `browser/PdfDocumentViewer.tsx` | PDF 阅读 | pdfjs-dist canvas 单页渲染、缩放、3 主题、页码跳转/滑块、前 120 页文本搜索、可点词文本覆盖层、AI 本页讲解（文本不足时上传页面 JPEG 走视觉）与查词、追问；**缺**：缩略图/目录大纲/旋转/连续滚动/双页/原生文本选择复制体验保障/与书架进度书签笔记高亮的后端绑定 |
| `EpubReader.tsx` | EPUB 阅读 | epubjs 代理加载、目录、字号、进度(CFI)回调；UI 提示“EPUB AI 段落解读暂不可用”（服务端无可核验章节文本/CFI 关联） |
| `NoorIslamicPdfPortal.tsx` | 伊斯兰/全球书籍检索与入库 | 调 `/api/library/islamic/books`，打开 PDF、下载/导入到书架；依赖阅读器内 AI 能力 |
| `bookEmbedUrl.ts` | 嵌入/来源/PDF URL 判断、RTL 语言判断 | 已有 `isRtlLanguage` 等工具，覆盖有限 |
| `searchFilters.ts`, `AdminLibrary.tsx` | 搜索过滤、管理 | 需与升级后元数据/权限策略对齐 |

### 2.3 后端图书馆与 AI（`earthone/server/`, `earthone/server.ts`）
| 模块 | 现状要点 |
|---|---|
| `server.ts` 图书馆路由（约 4964+） | 连接器/搜索/导入/EPUB 代理、书籍与书架 API、`/api/library/books/:id/ai-reading`（证据化）、知识笔记/进度/注释；挂载 Noor 路由 |
| `server/libraryReadingAi.ts` | `resolveReadingEvidence`：要求章节正文匹配选段、`textAvailability` 为 full_text/excerpt、可核验来源 URL 与版本标识；生成引用与受限 prompt（不声称读全书、不编造）——**方向正确，但仅覆盖“有服务端存储文本的章节选段”场景** |
| `server/noorIslamicPdfService.ts` | IslamHouse/Archive 等检索与流式代理、保存/上传 PDF 到书架、`/api/library/ai/explain-page`、`/api/library/ai/lookup-word`；`runFastLibraryAiText`：图像页优先 Gemini 视觉，否则 oneAiRouter→aiGateway 文本生成 |
| `server/geminiClient.ts` | `getGeminiClient/getGeminiLiveClient`，key 来源：env 或 `oneAiDb.getProviderWithCreds('gemini')`；v1beta；无 key 返回 null |
| `server/aiGateway.ts` | 统一生成入口之一（DeepSeek/Ollama/oneAi 路由等）；本次已修复：无云端 key 时本地模型回退与真实错误透传、`callOllamaNative` 错误细节回传 |
| `server/oneAi/*` | 路由/策略/配额/凭据体系；图书馆 AI 可能经由 `mode: library-reading` 走路由，但与“Gemini 专用 Library AI Service”目标不同 |
| `server/islamicLibraryCrawler.ts`, `integrations/libraries/*` | 多来源检索/爬取与元数据能力（需核对与升级计划的搜索/版权/可用性展示要求一致） |

### 2.4 数据模型与存储（`earthone/src/types/index.ts`, `earthone/server/store.ts`）
- `Book`：含 `chapters`、`formatType`(text/epub/pdf)、`epubUrl`、`externalReadUrl/sourceUrl`、权利/可用性字段等
- `BookShelfItem`：`progress`、`lastReadChapterId`、`lastReadEpubCfi`、状态与时间戳
- `BookAnnotation`：`bookId/userId/chapterId/selectedText/note/aiExplanation`、`color/kind/pageIndex`、`citation`、`createdAt`
- 存储：`server_data.json` + `server_data/books/` 等（JSON 持久化）；适合当前规模，升级时需注意并发写入、迁移与大字段（OCR 文本层/高亮坐标）设计

## 3. Google Gemini / AI 接入现状与风险

### 3.1 现状
- 依赖与封装已存在：`@google/genai` + `geminiClient.ts`；PDF 讲页在扫描图场景直接调用 `gemini-2.5-flash` 视觉能力（`noorIslamicPdfService.ts` 内 vision 分支）。
- Key 配置：`earthone/.env` 已写入 `GEMINI_API_KEY`（本地）；`.env` 被 `.gitignore` 忽略。`GEMINI_API_KEY` 也可由 oneAi DB 凭据提供。**未发现前端直接持有/请求 Gemini 官方 API 的实现**（前端调用站点后端接口）。
- 非视觉图书馆文本生成：主要经 `runFastLibraryAiText`/`ai-reading` 走 oneAiRouter 或 aiGateway（默认云端路径偏 DeepSeek 配置），**并非所有图书馆 AI 功能都强制使用 Gemini**，与计划“统一使用 Google Gemini API、Gemini Flash/Pro 策略”不一致。

### 3.2 必须补齐/验证项（真实接入，不可假冒）
- 在目标运行环境确认 `GEMINI_API_KEY`（或项目约定变量）已配置且重启生效；验证 `/api/library/ai/explain-page`、`/api/library/ai/lookup-word` 与未来 `/api/library-ai/*` 的真实 Gemini 响应（含 vision/文本模型）。
- 明确 Flash/Pro 模型 ID（以当前 Google AI 可用模型为准）与按任务路由策略；长章节需分块、汇总与“实际分析范围”声明。
- 统一错误返回与前端展示：无 key/鉴权失败/限流/超时/内容过长必须返回真实错误与可操作提示，禁止模拟回答。
- 服务端统一封装：模型选择、上下文拼装、长度控制、超时、权限校验、用量统计、日志脱敏（不输出 key/敏感原文超限内容）。

### 3.3 上下文与正确性差距（重点）
- 计划要求：讲解/查词/翻译/问答必须携带书名、章节、页码、选中文本、必要前后文、语言，并结合当前句子/书籍语境；区分原文/译文/AI 解释/补充知识；标注不确定性与不同观点；不编造页码引文。
- 现状：`ai-reading` 有证据与引用约束但限于服务端已存文本；PDF `explain-page` 传 `title/pageNumber/pageText`（及可选图像）但 prompt 对“前后文/页码引用/原文-解释区分/学科背景/不确定性”约束不足且非统一 schema；查词返回 JSON 但词根/词形/语境义等字段质量依赖模型、缺少强校验与“多义按上下文”保障。

### 3.4 本次已做的基础修复（利于排障，非功能完备）
- `server/aiGateway.ts`：无 DeepSeek key 时可回退到可用本地 Ollama 模型并透传失败原因；`callOllamaNative` 返回具体错误。
- `server/noorIslamicPdfService.ts`：`runFastLibraryAiText` 透传上游真实错误，便于前端/接口暴露可诊断信息。
- 影响：改善“AI 不可用但原因不明”的体验；**不等同于完成 Gemini 统一接入与全部 Library AI 能力**。

## 4. 阅读引擎与阅读体验差距

### 4.1 PDF
- 当前：`pdfjs-dist` 渲染 + 自研 UI（优点：可控、已含基础 AI 交互）；缺：目录/缩略图、旋转、连续滚动、单/双页切换的完整实现、原生可访问文本选择与复制策略、标注层与坐标持久化、按书恢复页码/缩放/模式/主题。
- 建议：评估在保留现有 AI 交互优势的前提下，引入/复用 Mozilla PDF.js viewer 能力或基于 `pdfjs-dist` 补齐同等功能；大型/扫描/阿拉伯语 PDF 做专项回归。

### 4.2 EPUB
- 当前：epubjs 基础可读；AI 段落解读禁用（缺可核验服务端文本与定位）。需支持主题/字号/背景/目录/书签/进度/选中与 RTL，并设计可验证的文本提取与引用定位方案后再开放 AI。

### 4.3 阿拉伯语与 RTL（核心）
- 需系统检查：`dir=rtl`/bidi、阿语字体与连字、混排（ar/zh/en）、标点与注释、PDF 原排版保真（不翻转）、EPUB 重排版 RTL、阅读方向与 UI 镜像合理性。扫描版古籍保持清晰并预留/实现 OCR。

### 4.4 扫描版与 OCR
- 现状：无 Tesseract；仅 PDF 讲页在文本稀少时可发送页面图像给 Gemini 视觉识别讲解（覆盖有限、无独立文本层/缓存/区域选择/多语言 OCR 管线）。
- 计划要求：`/api/library-ai/ocr`（或等效）、阿/中/英识别、结果与页码关联、可缓存、可送 Gemini、不破坏原 PDF、失败明确提示。

## 5. 统一 Library AI Service 目标架构（建议）

- 后端新增 `LibraryAIService`（优先复用/扩展现有 Gemini/AI 基础设施，避免重复客户端）：
  - 能力：`explain` `translate` `dictionary` `analyze` `summarize` `ask` `ocr`
  - 输入：`bookId/title/chapter/page/language/selectedText/surroundingContext/userQuestion/mode` 等统一上下文对象
  - 模型：Flash（词义/翻译/快速讲解/问答）与 Pro（长文/章节/深度分析）按任务与长度路由，可配置可降级并明确告知
  - 输出：结构化结果 + 引用元信息（书名/章节/页码/原文片段/分析范围）+ 不确定性标记
  - 治理：鉴权、超时、分块、缓存（可选）、用量统计、错误码
- 前端：统一 AI 面板/抽屉与选中文本动作，按当前书籍与阅读位置更新上下文；移动端不遮挡正文。

## 6. 阅读数据与个人知识管理差距

- 已有：书架状态/进度/章节与 EPUB CFI 字段、注释接口与字段（含高亮/书签/笔记类型、页索引、引用）。
- 待做：PDF 阅读器与后端完全打通（自动恢复页码/缩放/模式/主题/书签/高亮）、阅读历史视图、文本层高亮坐标（可用时）与扫描页标注策略、与用户身份一致的权限校验。

## 7. 安全与合规检查

- API Key：服务端环境变量/密钥存储读取；禁止前端与仓库提交——**符合方向**；需持续审计日志与错误信息不泄露密钥。
- `.env`/`server_data`/`data/pdfs` 等应保持 gitignore；提交前检查 diff。
- 外部书源：保持来源/权利/可用性标识准确，不伪造可下载/可复制权限。

## 8. 分阶段实施建议（对齐计划）

1. **Phase 1（已完成审查）**：本报告；冻结基线，盘点可复用模块与风险。
2. **Phase 2**：PDF/EPUB 兼容性与阅读器能力补齐（优先 PDF 专业能力与 PDF 状态持久化；EPUB 文本/定位可核验后再开 AI）。
3. **Phase 3-4**：统一阅读 UI/工具栏与 RTL/多语言/阿语专项（真实 ar/zh/en、混排、扫描样本）。
4. **Phase 5**：实现统一 `LibraryAIService` + Gemini Flash/Pro 路由与 `/api/library-ai/*`（先 explain/dictionary/translate/ask，再 analyze/summarize），严格上下文与引用输出。
5. **Phase 6-7**：OCR 管线（扫描页/区域、ar/zh/en、文本层缓存）与接入 AI；章节长文分块分析。
6. **Phase 8**：书签/笔记/高亮/阅读历史与进度恢复全链路。
7. **Phase 9**：按计划清单做真实 PDF/EPUB/AI/OCR/异常场景回归，禁止假数据冒充。

每阶段：类型检查/相关测试 → 确认无回归 → 仅提交本阶段文件 → 推送（需在可用 git 凭据与远端策略下执行）。

## 9. 已知环境事实（本次审查）

- `earthone/.git` 存在，工作区有未提交修改：`server/aiGateway.ts`、`server/noorIslamicPdfService.ts`；另有未跟踪项（如 `package-lock.json`）需按阶段取舍。
- `earthone/.env` 已配置 `GEMINI_API_KEY`（本地）；线上部署需在平台环境变量/Secrets 同步配置并重启。
- 本地 `ollama` 可用模型检测到 `qwen3:8b`、`qwen3:8b-8k`（可作为回退，非 Gemini 真实接入替代）。

## 10. 下一步（建议立即执行）

- 与产品确认 Phase 2/5 优先级（先“阅读器专业化”还是先“Gemini 统一 AI 服务”）；两者可并行但需接口契约先行。
- 设计 `/api/library-ai/*` 请求/响应 schema（含上下文、引用、分析范围、错误码），并实现最小可用 Gemini-backed `explain/dictionary/translate/ask` 以替换/兼容现有分散端点。
- 为 PDF 阅读器补齐阅读位置/设置持久化与书签/高亮落库（先文本可选 PDF，再扩展扫描页策略）。
- 准备真实测试样本集（ar/zh/en、混排、扫描版、大文件、EPUB）与 Gemini 配置验证脚本。
