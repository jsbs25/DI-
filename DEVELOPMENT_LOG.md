# EARTH ONE — 开发日志（DEVELOPMENT LOG）

## 2026-11-04

### 数据层重构：书籍全文抽离（本次核心）

**问题**：`server_data.json` 承载所有书籍全文，已膨胀到 3.6MB；每次写入（点赞/消息/存书）都整文件重写，且随书籍增多会指数级变慢。

**方案**（兼容式，不破坏功能）：
- 书籍章节正文抽离到 `server_data/books/{bookId}.json`（每本书独立文件）。
- `server_data.json` 只保留书籍元数据 + 章节标题（不存正文）。
- 列表/书架接口返回元数据；详情接口返回完整章节。
- 旧数据在启动时自动迁移（抽离正文 + 回写精简主文件）。

**改动文件**：
- `server/store.ts`：新增内容文件读写（`writeBookContent`/`loadBookContent`/`bookContentFile`/`hasInlineContent`）、`stripBookContent` 导出；`saveToDisk` 写元数据版；`loadFromDisk` 迁移+回水；`addBook`/`updateBook`/`deleteBook` 管理内容文件。
- `server.ts`：列表/书架接口返回元数据；导入 `stripBookContent`。
- `src/components/library/DigitalLibrary.tsx`：新增 `loadFullBook`/`openBookDetail`/`openShelfBook`，打开详情/阅读器前拉取完整章节。
- `.gitignore`：忽略 `server_data/`、`server_data.backup.json`。

**验证结果**：
- `server_data.json`：3.6MB → 225KB（40 本，仅元数据）。
- 列表接口：30KB（元数据，章节 content 为空）。
- 详情接口：1.26MB（《تفسير القرطبي》30 章完整正文）。
- 清理 5 本重复测试书。

### 上一轮（同日更早）

- 修复书籍全文分章（`fetchBookFullText` 按真实章节标记拆分，支持单换行/多标记兜底）。
- 新增书源：阿拉伯语维基文库 + Internet Archive（含 OCR 全文文件名解析）。
- 新增知识宇宙知识图谱 + 全局统一搜索。

## 待办

- [ ] 列表/详情分离后，补前端「阅读历史/最近阅读」对详情接口的复用确认。
- [ ] 密码哈希升级 bcrypt/argon2。
- [ ] 登录限流 + 会话过期。
- [ ] 国家/城市详情页。
- [ ] 个人知识库（统一双向链接）。

## 安全加固（2026-11-04 追加）

- 密码哈希：SHA-256+盐 → scrypt（内存困难），旧哈希登录时透明升级。
- 登录/注册限流：内存滑动窗口，登录 10 次/15 分钟、注册 20 次/15 分钟（按 IP）。
- 验证：种子账号登录成功并自动迁移为 scrypt 哈希；错误密码 401。


### WORLD LIBRARY：真实全球图书来源连接器（2026-11-04）

- 建立 `server/integrations/libraries/index.ts` 统一连接器接口、来源注册表、标准书目/权利字段、结果聚合和精确 ISBN/DOI 去重；Open Library、Internet Archive、Project Gutenberg 与既有中文/阿拉伯语 Wikisource 共五个来源可分别由环境变量开关。
- 新增 `/api/library/connectors`、`/api/library/search`，并将 `/api/library/ingest` 改为使用来源 ID 在服务端重新查询官方记录后再判断权利和可用文件；Open Library 元数据、权利未知/借阅受限记录不会伪装为全文。既有本地图书目录、书架、进度、详情和阅读器流程保留。
- Internet Archive 查询按官方 Lucene 语法限制在 `title`、`creator`、`identifier` 字段和 `mediatype:texts`，降低全文索引的无关结果；导入还要求明确可复制权利标记及官方元数据列出的 OCR 文件。Gutenberg 使用官方 OPDS `query` 参数，并在导入时再读取单书 OPDS 验证 TXT/EPUB 链接；公共领域说明带美国法域提醒。OPDS 语言字段从命名空间 XML 读取，不存在时返回 `und`，不再默认误标为英语。
- 新增 `LIBRARY_CONNECTORS.md`、`scripts/test_library_connectors.ts`、`scripts/test_library_connectors_live.ts`，并注册 `test:library-connectors` 与 `test:library-connectors:live` 命令；更新功能清单与项目专项审计。
- 在 Phase 1/2 阶段，配置只新增可选联系邮箱与五个连接器开关示例；当时尚未接入的学术、Europeana、Google Books 与阿拉伯语资源列为后续事项。Google Books 已在下方 Phase 3 独立接入。
- 验证：TypeScript 检查通过；离线连接器测试通过；隔离图书馆 API 回归 20 项通过；生产构建成功；实时官方来源烟测通过（Open Library、Internet Archive 搜索，以及 Gutenberg 搜索至隔离书目详情链路，未下载 EPUB）。全站浏览器回归和其他待批准权限相关路由未执行。

- UI 搜索卡片/详情页显示来源权利说明及通过 HTTPS 校验的许可原文链接；客户端仅在来源明确返回 `canImport: true` 时提供本地导入按钮，服务器仍再次验证来源记录和权限。该 UI 变更通过类型检查与生产构建，未进行本轮浏览器视觉验收。


- GitHub 同步：实现提交 `2cb84e9f7093cc03aa942a5d2540a3fda96f6a8c` 已从 `4f6fe82c784ad4bf63d63217f971437046684536` 普通快进推送至 `main`；推送后 fetch 和 GitHub connector API 均确认远端、跟踪分支和本地 HEAD 一致。未强推、未持久保存凭据或改变 Git 全局配置。


### WORLD LIBRARY Phase 3：Google Books（2026-11-04）

- 基于已同步 `main` 提交 `938fbe2` 在安全工作树中继续；未改动 `/workspace/DI-review`。新增 `GoogleBooksConnector` 并纳入六源注册表、默认聚合搜索、`/api/library/search` 来源白名单和前端来源标签；`.env.example` 增加服务端 `GOOGLE_BOOKS_API_KEY` 与 `EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED`。没有密钥时来源保持禁用；各 Google 请求有官方 API key，但密钥不进入浏览器、缓存键或日志。
- 支持 Google Books Volumes API 书目搜索、ISBN 查询、`author:` 查询、卷详情与访问状态查询；映射作者、出版社、日期、ISBN、语言、描述、封面、官方页面/预览、地区、`viewability` 和下载可用性。
- 权利限制保持 fail-closed：预览/仅元数据/未知状态不会得到下载入口；只在 API 报告当地 public-domain、下载未受限、EPUB/PDF 可用且官方下载 URL 在 Google 主机白名单时返回提供方链接。Google Books 全文复制与本地导入一律不支持，API 入库路由有独立拒绝分支；来源说明区分服务内可见性与再利用许可。
- 更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md`、`LIBRARY_CONNECTORS.md`，记下官方 API/schema 链接和本阶段验证边界。
- 验证：`npm run lint`、`npm run test:library-connectors` 通过；隔离 `npm run test:library-api` 为 21/21；`npm run build` 成功。Google Books API key 未配置，未对 Google Books 执行真实网络请求；其他连接器保持既有实现和数据不变。


### WORLD LIBRARY Phase 3：Europeana（2026-11-04）

- 基于最新同步的 `main`（`e027c4c`）在原有连接器接口中新增 Europeana；现有来源目录增至七个。`/api/library/search` 默认聚合 Europeana，服务端 source allowlist、前端来源名称和 `.env.example` 同步更新；既有本地目录、书架、阅读器和其他来源未删改。
- 使用官方 Search API（`/record/v2/search.json`）与 Record API；支持关键词、`author:`→`proxy_dc_creator` 查询、记录详情及书目字段标准化。继续采用每来源节流/缓存和精确 ISBN/DOI 去重，不做模糊标题合并。
- 新增 `edm:rights` URI 映射：CC0/Public Domain Mark → `PUBLIC_DOMAIN`，已识别 CC 许可 → `OPEN_LICENSE`，已知 InC/NoC 限制声明 → `COPYRIGHT_RESTRICTED`，冲突/未知/CNE → `UNKNOWN`。元数据 CC0 不外推为数字对象许可。只有 PDM/CC0 或 CC BY/CC BY-SA 并且缩略图来自 HTTPS Europeana 域名时返回缩略图；所有结果禁止本地全文导入，不提供直接下载或全文接口。
- `EUROPEANA_API_KEY` 必须由服务器配置，独立开关为 `EARTH_ONE_LIBRARY_EUROPEANA_ENABLED`。密钥缺失时连接器 fail-closed、注册表显示 disabled、搜索不发请求；官方响应可能回显 `apikey`，实现已在共享缓存前去除该字段，同时从缓存键剔除 `wskey`。服务端 `/api/library/ingest` 显式拒绝 Europeana 导入。
- 更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md`、`LIBRARY_CONNECTORS.md`，记录官方 API/rights 文档、密钥申请方式与测试限制。无真实 Europeana API key，本轮未执行在线请求；离线 mock 不是在线可用性证明。
- 验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（23/23）、`npm run test:api`（85/85）及 `npm run build` 均通过。生产构建保留既有 Three.js 大 chunk 提示；未运行全站浏览器视觉回归或移动设备测试。
- 统一搜索卡片同步呈现来源的可用/禁用/失败状态与原因，并展示可用的资源类型、DOI/ISBN、访问和下载状态，避免缺 key 时误呈现为“无搜索结果”；本轮只做类型检查与构建验证，未执行浏览器视觉测试。


### WORLD LIBRARY Phase 4：免密钥学术发现（2026-11-04）

- 从已同步主线基线 `f160fa1825cbf2ac1f534bfec83767ef34110e4c` 开始，起始工作树干净；没有请求 API key，也没有修改用户书架或正式数据。新增 OpenAlex、Crossref、arXiv、Europe PMC 四个无需账号/密钥的官方查询适配器；Google Books 与 Europeana 继续缺 key 即 fail-closed。
- 四源加入注册表、默认统一搜索、服务端白名单和 `.env.example` 独立开关。搜索结果显示来源与官方记录页；在提供方明确返回可访问入口时，UI 另行展示经过 HTTPS 校验的官方全文入口。精确 DOI 去重继续复用。
- 权利安全：四个学术连接器均固定 `canImport: false`、不提供本地下载链接；全文复制/下载 connector 方法明确 `unsupported`；服务端 `/api/library/ingest` 独立拒绝四源导入（403）。开放获取只代表访问，不自动表示可再利用。arXiv 串行请求间隔至少 3 秒。
- 官方接口文档已在 `LIBRARY_CONNECTORS.md` 链接记录。新增离线 fixtures，并将四源加入可重复实时烟测脚本。
- 验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（25 项）、`npm run test:api`（85 项）、`npm run build`、`npm run test:library-connectors:live` 全部通过；实时搜索四源均返回记录。生产构建仍有非阻断的 Three.js 大 chunk 提示；未下载 EPUB 或复制受限全文。


### WORLD LIBRARY Phase 4 follow-up：PMC 与 DOAB（2026-11-04）

本段更新前面的 Phase 4 四源初始快照：新增 PubMed Central 独立来源，当前连接器总数为 12。PMC 使用官方 NCBI E-utilities `ESearch`/`ESummary`，无需 API key；搜索结果链接到 PMC 官方文章页，权利一律保守标记 `UNKNOWN`，全文/下载操作明确 unsupported，服务端入库继续返回 403。每个来源的请求队列串行且间隔至少一秒。尝试使用 NCBI 文档中的旧 `free fulltext[filter]` 示例时，当前在线端点返回 0 条，因此实现改用 PMC 书目检索，不再误称结果已通过该筛选；不会复制全文或推断单篇许可。

DOAB 官方资料确认其元数据为 CC0，并提供 OAI-PMH、公开元数据文件及 PRISM 接口；但 OAI-PMH 是分页记录收割，不是关键词搜索，当前目录 REST 候选接口返回 HTTP 403/429，故没有用未验证路由或批量抓取来冒充实时搜索。没有要求用户提供密钥或进行设置。详细官方来源与边界记录在 `LIBRARY_CONNECTORS.md`。

最终验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（27/27）、`npm run test:api`（85/85）、`npm run build` 和 `npm run test:library-connectors:live` 全部通过；真实限量烟测包含 PMC 且无需密钥。构建仍有既有 Three.js 大 chunk 非阻断提示；测试使用隔离临时数据，没有修改正式用户书架或图书数据。


### WORLD LIBRARY Phase 4 follow-up：PubMed 免密钥检索（2026-11-04）

- 新增 NCBI PubMed 官方 E-utilities 连接器（`db=pubmed`），作为 PMC（`db=pmc`）之外的独立书目索引接入。无需用户密钥/账号，默认参与统一搜索，支持一般关键词、作者、题名、PMID、PMCID 和 DOI 查询；结果标准化为 PubMed 官方记录链接、作者、期刊、年份、PMID 和 DOI。
- PubMed 与 PMC 共用 NCBI 的串行请求限速队列，避免两个连接器并行时超出同一服务的速率策略。PubMed 固定为 `METADATA_ONLY`，即使元数据带 PMCID 也不表示全文已确认；全文、下载和本地导入明确 unsupported / 403。用户可见权利提示还链接 NCBI/NLM 官方免责声明，并提醒摘要可能含受版权保护内容。跨库只按精确 DOI 去重。
- PubMed 加入来源注册、统一搜索、服务端白名单和导入拒绝、搜索卡片来源名称、`.env.example` 的 `EARTH_ONE_LIBRARY_PUBMED_ENABLED` 开关、离线 mock 与真实限量烟测。更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md` 和 `LIBRARY_CONNECTORS.md`；13 个来源保持此前全部功能与本地数据不变。
- 验证：`npm run lint` 与 `npm run test:library-connectors` 通过；隔离图书馆 API 29/29、通用 API 85/85、生产构建通过；限量在线烟测中的 PubMed、PMC、OpenAlex、Crossref、arXiv、Europe PMC 和既有书目来源均返回结果。生产构建仍报告既有 Three.js 大 chunk 提示。未下载论文或改动正式书架数据；未运行浏览器/移动端视觉回归。
